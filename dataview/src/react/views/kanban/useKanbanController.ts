import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type {
  Field,
  CustomField,
  Row,
  View,
  ViewId
} from '@dataview/core/contracts'
import { isCustomField } from '@dataview/core/field'
import {
  useDataView,
  useDataViewValue,
} from '@dataview/react/dataview'
import {
  DATAVIEW_APPEARANCE_ID_ATTR,
  dataviewAppearanceSelector
} from '@dataview/dom/appearance'
import {
  closestTarget,
  interactiveSelector
} from '@shared/dom'
import {
  move as currentViewMove
} from '@dataview/engine/project'
import {
  type AppearanceId,
  type AppearanceList,
  type FieldList,
  type Section,
  type SectionKey
} from '@dataview/engine/project'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import {
  createVisualTargetRegistry,
  type VisualTargetRegistry
} from '@dataview/react/runtime/marquee'
import type {
  Selection
} from '@dataview/react/runtime/selection'
import { useStoreValue } from '@shared/react'
import {
  readBoardLayout
} from './drag'
import {
  useDrag
} from './drag'
import { usesOptionGroupingColors } from '@dataview/react/views/shared/optionGrouping'

interface KanbanCurrentView {
  view: View
  appearances: AppearanceList
  sections: readonly Section[]
  fields: FieldList
}

interface KanbanSelectionState {
  selection: Selection
  selectedIds: readonly AppearanceId[]
  selectedIdSet: ReadonlySet<AppearanceId>
  select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
}

export interface KanbanController {
  currentView: KanbanCurrentView
  fields: readonly CustomField[]
  groupField?: Field
  canReorder: boolean
  groupUsesOptionColors: boolean
  fillColumnColor: boolean
  layout: {
    columnWidth: number
    columnMinHeight: number
  }
  scrollRef: RefObject<HTMLDivElement | null>
  selection: KanbanSelectionState
  drag: ReturnType<typeof useDrag>
  readSectionColorId: (sectionKey: SectionKey) => string | undefined
  readAppearanceColorId: (id: AppearanceId) => string | undefined
  readRecord: (id: AppearanceId) => Row | undefined
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
}

export const useKanbanController = (input: {
  viewId: ViewId
  columnWidth: number
  columnMinHeight: number
}): KanbanController => {
  const dataView = useDataView()
  const engine = dataView.engine
  const activeView = useDataViewValue(dataView => dataView.engine.read.activeView, view => (
    view?.id === input.viewId
      ? view
      : undefined
  ))
  const appearances = useDataViewValue(dataView => dataView.engine.project.appearances)
  const sectionsProjection = useDataViewValue(dataView => dataView.engine.project.sections)
  const fieldsProjection = useDataViewValue(dataView => dataView.engine.project.fields)
  const currentView = useMemo<KanbanCurrentView | undefined>(() => (
    activeView && appearances && sectionsProjection && fieldsProjection
      ? {
          view: activeView,
          appearances,
          sections: sectionsProjection,
          fields: fieldsProjection
        }
      : undefined
  ), [activeView, appearances, fieldsProjection, sectionsProjection])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(scrollRef.current)
  })).current

  if (!currentView) {
    throw new Error('Kanban view requires an active current view.')
  }
  const groupProjection = useDataViewValue(dataView => dataView.engine.project.group)
  const sortProjection = useDataViewValue(dataView => dataView.engine.project.sort)

  const fields = useMemo(() => {
    return currentView.fields.all.filter(isCustomField)
  }, [
    currentView.fields.all
  ])
  const groupField = groupProjection?.field
  const groupUsesOptionColors = usesOptionGroupingColors(groupField)
  const fillColumnColor = groupUsesOptionColors
    && currentView.view.options.kanban.fillColumnColor
  const canReorder = (groupProjection?.active ?? false) && !(sortProjection?.active ?? false)

  const readRecord = useCallback((id: AppearanceId) => {
    const recordId = currentView.appearances.get(id)?.recordId
    return recordId
      ? engine.read.record.get(recordId)
      : undefined
  }, [currentView, engine.read.record])

  const sectionKeyById = useMemo(() => new Map(
    currentView.sections.flatMap(section => section.ids.map(id => [id, section.key] as const))
  ), [currentView.sections])
  const sectionColorByKey = useMemo(() => new Map(
    currentView.sections.map(section => [section.key, section.color] as const)
  ), [currentView.sections])

  const selectionValue = useDataViewValue(
    dataView => dataView.selection.store
  )
  const marqueeSession = useStoreValue(dataView.marquee.store)
  const marqueeActive = marqueeSession?.ownerViewId === currentView.view.id
  const selectedIdSet = useMemo(
    () => new Set(selectionValue.ids),
    [selectionValue.ids]
  )

  useEffect(() => {
    return dataView.marquee.registerAdapter({
      viewId: currentView.view.id,
      disabled: dragging,
      canStart: (event: PointerEvent) => !closestTarget(event.target, [
        dataviewAppearanceSelector,
        interactiveSelector
      ].join(',')),
      getTargets: () => visualTargets.getTargets(currentView.appearances.ids),
      order: () => currentView.appearances.ids,
      resolveAutoPanTargets: () => resolveDefaultAutoPanTargets(scrollRef.current),
      onStart: () => {
        visualTargets.clearFrozen()
      },
      onEnd: () => {
        visualTargets.clearFrozen()
      },
      onCancel: () => {
        visualTargets.clearFrozen()
      }
    })
  }, [
    currentView.appearances.ids,
    currentView.view.id,
    dataView.marquee,
    dragging,
    visualTargets,
  ])

  const selection = useMemo<KanbanSelectionState>(() => ({
    selection: selectionValue,
    selectedIds: selectionValue.ids,
    selectedIdSet,
    select: (id, mode = 'replace') => {
      if (mode === 'toggle') {
        dataView.selection.toggle([id])
        return
      }

      dataView.selection.set([id])
    }
  }), [
    dataView.selection,
    selectedIdSet,
    selectionValue
  ])
  const readSectionColorId = useCallback((sectionKey: SectionKey) => (
    groupUsesOptionColors
      ? sectionColorByKey.get(sectionKey)
      : undefined
  ), [groupUsesOptionColors, sectionColorByKey])
  const readAppearanceColorId = useCallback((id: AppearanceId) => {
    const sectionKey = sectionKeyById.get(id)
    return sectionKey
      ? readSectionColorId(sectionKey)
      : undefined
  }, [readSectionColorId, sectionKeyById])

  const drag = useDrag({
    containerRef: scrollRef,
    canDrag: canReorder,
    itemMap: new Map(currentView.appearances.ids.map(id => [id, id] as const)),
    getLayout: () => readBoardLayout(scrollRef.current),
    getDragIds: activeId => currentViewMove.drag(
      currentView.appearances.ids,
      selection.selectedIds,
      activeId
    ),
    onDraggingChange: setDragging,
    onDrop: (cardIds, target) => {
      dataView.engine.view(currentView.view.id).items.moveAppearances(cardIds, {
        section: target.sectionKey,
        ...(target.beforeAppearanceId ? { before: target.beforeAppearanceId } : {})
      })
    }
  })

  return useMemo(() => ({
    currentView,
    fields,
    groupField,
    canReorder,
    groupUsesOptionColors,
    fillColumnColor,
    layout: {
      columnWidth: input.columnWidth,
      columnMinHeight: input.columnMinHeight
    },
    scrollRef,
    selection,
    drag,
    readSectionColorId,
    readAppearanceColorId,
    readRecord,
    marqueeActive,
    visualTargets
  }), [
    canReorder,
    currentView,
    fillColumnColor,
    drag,
    groupUsesOptionColors,
    groupField,
    input.columnMinHeight,
    input.columnWidth,
    marqueeActive,
    fields,
    readAppearanceColorId,
    readRecord,
    readSectionColorId,
    selection,
    visualTargets
  ])
}
