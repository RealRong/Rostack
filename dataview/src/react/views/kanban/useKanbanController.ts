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
  ViewId
} from '@dataview/core/contracts'
import { isCustomField } from '@dataview/core/field'
import {
  useDataView,
  useCurrentView,
  useSelection as useDataViewSelection,
} from '@dataview/react/dataview'
import {
  DATAVIEW_APPEARANCE_ID_ATTR,
  dataviewAppearanceSelector
} from '@dataview/dom/appearance'
import {
  closestTarget,
  interactiveSelector
} from '@dataview/dom/interactive'
import {
  move as currentViewMove
} from '@dataview/engine/projection/view'
import {
  type AppearanceId,
  type CurrentView,
  type SectionKey
} from '@dataview/react/runtime/currentView'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import {
  createVisualTargetRegistry,
  type VisualTargetRegistry
} from '@dataview/react/runtime/marquee'
import { useStoreValue } from '@dataview/react/store'
import {
  readBoardLayout
} from './drag'
import {
  useDrag
} from './drag'
import { usesOptionGroupingColors } from '@dataview/react/views/shared/optionGrouping'

interface KanbanSelectionState {
  selection: ReturnType<typeof useDataViewSelection>
  selectedIds: readonly AppearanceId[]
  selectedIdSet: ReadonlySet<AppearanceId>
  select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
}

export interface KanbanController {
  currentView: CurrentView
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
  const currentView = useCurrentView(view => (
    view?.view.id === input.viewId
      ? view
      : undefined
  ))
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(scrollRef.current)
  })).current

  if (!currentView) {
    throw new Error('Kanban view requires an active current view.')
  }

  const fields = useMemo(() => {
    return currentView.fields.all.filter(isCustomField)
  }, [
    currentView.fields.all
  ])
  const groupField = useMemo(() => {
    const groupFieldId = currentView.view.query.group?.field
    return groupFieldId
      ? currentView.schema.fields.get(groupFieldId)
      : undefined
  }, [currentView.schema.fields, currentView.view.query.group?.field])
  const groupUsesOptionColors = usesOptionGroupingColors(groupField)
  const fillColumnColor = groupUsesOptionColors
    && currentView.view.options.kanban.fillColumnColor
  const canReorder = Boolean(currentView.view.query.group) && !currentView.view.query.sorters.length

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

  const selectionValue = useDataViewSelection()
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
      currentView.commands.move.ids(cardIds, {
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
