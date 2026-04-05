import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@dataview/core/contracts'
import {
  resolveGroupTitleProperty
} from '@dataview/core/view'
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
  readBoardLayout,
  type BoardLayout,
  type CardPosition
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

interface KanbanLayoutRegistry {
  set: (key: SectionKey, layouts: readonly CardPosition[]) => void
  clear: (key: SectionKey) => void
  read: () => BoardLayout | null
}

export interface KanbanController {
  currentView: CurrentView
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  canReorder: boolean
  groupUsesOptionColors: boolean
  fillColumnColor: boolean
  layout: {
    columnWidth: number
    columnMinHeight: number
  }
  scrollRef: RefObject<HTMLDivElement | null>
  layouts: KanbanLayoutRegistry
  selection: KanbanSelectionState
  drag: ReturnType<typeof useDrag>
  boostedSectionKeySet: ReadonlySet<string>
  readSectionColorId: (sectionKey: SectionKey) => string | undefined
  readAppearanceColorId: (id: AppearanceId) => string | undefined
  readRecord: (id: AppearanceId) => GroupRecord | undefined
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
  const columnLayoutsRef = useRef<Map<SectionKey, readonly CardPosition[]>>(new Map())
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(scrollRef.current)
  })).current

  if (!currentView) {
    throw new Error('Kanban view requires an active current view.')
  }

  const titleProperty = useMemo(
    () => resolveGroupTitleProperty(
      Array.from(currentView.schema.properties.values())
    ),
    [currentView.schema.properties]
  )
  const properties = useMemo(() => {
    return currentView.properties.all.filter(property => (
      property.id !== titleProperty?.id
    ))
  }, [
    currentView.properties.all,
    titleProperty?.id
  ])
  const groupProperty = useMemo(() => {
    const groupPropertyId = currentView.view.query.group?.property
    return groupPropertyId
      ? currentView.schema.properties.get(groupPropertyId)
      : undefined
  }, [currentView.schema.properties, currentView.view.query.group?.property])
  const groupUsesOptionColors = usesOptionGroupingColors(groupProperty)
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
  const layouts = useMemo<KanbanLayoutRegistry>(() => ({
    set: (key, positions) => {
      columnLayoutsRef.current.set(key, positions)
    },
    clear: key => {
      columnLayoutsRef.current.delete(key)
    },
    read: () => readBoardLayout(scrollRef.current, columnLayoutsRef.current)
  }), [])

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
    getLayout: layouts.read,
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

  const boostedSectionKeySet = useMemo(() => {
    const keys = new Set<string>()
    drag.dragIds.forEach(id => {
      const key = sectionKeyById.get(id)
      if (key) {
        keys.add(key)
      }
    })
    if (drag.overTarget?.sectionKey) {
      keys.add(drag.overTarget.sectionKey)
    }
    return keys
  }, [drag.dragIds, drag.overTarget?.sectionKey, sectionKeyById])

  return useMemo(() => ({
    currentView,
    titleProperty,
    properties,
    canReorder,
    groupUsesOptionColors,
    fillColumnColor,
    layout: {
      columnWidth: input.columnWidth,
      columnMinHeight: input.columnMinHeight
    },
    scrollRef,
    layouts,
    selection,
    drag,
    boostedSectionKeySet,
    readSectionColorId,
    readAppearanceColorId,
    readRecord,
    marqueeActive,
    visualTargets
  }), [
    boostedSectionKeySet,
    canReorder,
    currentView,
    fillColumnColor,
    drag,
    groupUsesOptionColors,
    input.columnMinHeight,
    input.columnWidth,
    layouts,
    marqueeActive,
    properties,
    readAppearanceColorId,
    readRecord,
    readSectionColorId,
    selection,
    titleProperty,
    visualTargets
  ])
}
