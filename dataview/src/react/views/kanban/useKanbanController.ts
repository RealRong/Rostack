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
  KanbanCardsPerColumn,
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
} from '@dataview/react/dom/appearance'
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

const emptyIds = [] as const

const resolveInitialVisibleCount = (
  limit: KanbanCardsPerColumn,
  total: number
) => (
  limit === 'all'
    ? total
    : Math.min(total, limit)
)

export interface KanbanController {
  currentView: KanbanCurrentView
  fields: readonly CustomField[]
  groupField?: Field
  canReorder: boolean
  groupUsesOptionColors: boolean
  fillColumnColor: boolean
  cardsPerColumn: KanbanCardsPerColumn
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
  readVisibleIds: (sectionKey: SectionKey) => readonly AppearanceId[]
  readVisibleCount: (sectionKey: SectionKey) => number
  hiddenCount: (sectionKey: SectionKey) => number
  canShowMore: (sectionKey: SectionKey) => boolean
  showMore: (sectionKey: SectionKey) => void
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
  const activeState = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => (
      state
      && state.view.id === input.viewId
      && state.view.type === 'kanban'
      && state.appearances
      && state.sections
      && state.fields
        ? state
        : undefined
    )
  )
  const currentView = useMemo<KanbanCurrentView | undefined>(() => (
    activeState
      ? {
          view: activeState.view,
          appearances: activeState.appearances!,
          sections: activeState.sections!,
          fields: activeState.fields!
        }
      : undefined
  ), [activeState])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(scrollRef.current)
  })).current

  if (!currentView) {
    throw new Error('Kanban view requires an active current view.')
  }
  const groupProjection = activeState?.group
  const sortProjection = activeState?.sort

  const fields = useMemo(() => {
    return currentView.fields.all.filter(isCustomField)
  }, [
    currentView.fields.all
  ])
  const groupField = groupProjection?.field
  const groupUsesOptionColors = usesOptionGroupingColors(groupField)
  const fillColumnColor = groupUsesOptionColors
    && currentView.view.options.kanban.fillColumnColor
  const cardsPerColumn = currentView.view.options.kanban.cardsPerColumn
  const canReorder = (groupProjection?.active ?? false) && !(sortProjection?.active ?? false)
  const [expandedCountBySectionKey, setExpandedCountBySectionKey] = useState<Partial<Record<SectionKey, number>>>({})
  const previousSectionLengthsRef = useRef(new Map<SectionKey, number>())

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
    setExpandedCountBySectionKey({})
    previousSectionLengthsRef.current = new Map(
      currentView.sections.map(section => [section.key, section.ids.length] as const)
    )
  }, [currentView.view.id, cardsPerColumn])

  useEffect(() => {
    if (cardsPerColumn === 'all') {
      previousSectionLengthsRef.current = new Map(
        currentView.sections.map(section => [section.key, section.ids.length] as const)
      )
      return
    }

    setExpandedCountBySectionKey(previous => {
      let changed = false
      const next = {
        ...previous
      }
      const previousLengths = previousSectionLengthsRef.current
      const sectionKeys = new Set(currentView.sections.map(section => section.key))

      Object.keys(next).forEach(sectionKey => {
        if (!sectionKeys.has(sectionKey)) {
          delete next[sectionKey]
          changed = true
        }
      })

      currentView.sections.forEach(section => {
        const previousLength = previousLengths.get(section.key)
        if (previousLength === undefined) {
          return
        }

        const previousInitialVisibleCount = resolveInitialVisibleCount(
          cardsPerColumn,
          previousLength
        )
        const previousExpandedCount = previous[section.key]
        const previousVisibleCount = previousExpandedCount === undefined
          ? previousInitialVisibleCount
          : Math.min(
            previousLength,
            Math.max(previousInitialVisibleCount, previousExpandedCount)
          )
        const currentVisibleCount = next[section.key] === undefined
          ? resolveInitialVisibleCount(cardsPerColumn, section.ids.length)
          : Math.min(
            section.ids.length,
            Math.max(
              resolveInitialVisibleCount(cardsPerColumn, section.ids.length),
              next[section.key]!
            )
          )

        if (
          section.ids.length > previousLength
          && previousVisibleCount >= previousLength
          && currentVisibleCount < section.ids.length
        ) {
          next[section.key] = section.ids.length
          changed = true
        }
      })

      return changed
        ? next
        : previous
    })

    previousSectionLengthsRef.current = new Map(
      currentView.sections.map(section => [section.key, section.ids.length] as const)
    )
  }, [currentView.sections, cardsPerColumn])

  const sectionIdsByKey = useMemo(() => new Map(
    currentView.sections.map(section => [section.key, section.ids] as const)
  ), [currentView.sections])
  const visibleCountBySectionKey = useMemo(() => new Map(
    currentView.sections.map(section => {
      const initialVisibleCount = resolveInitialVisibleCount(
        cardsPerColumn,
        section.ids.length
      )
      const expandedCount = expandedCountBySectionKey[section.key]
      const visibleCount = expandedCount === undefined
        ? initialVisibleCount
        : Math.min(section.ids.length, Math.max(initialVisibleCount, expandedCount))

      return [section.key, visibleCount] as const
    })
  ), [currentView.sections, expandedCountBySectionKey, cardsPerColumn])
  const visibleIdsBySectionKey = useMemo(() => new Map(
    currentView.sections.map(section => [
      section.key,
      section.ids.slice(0, visibleCountBySectionKey.get(section.key) ?? 0)
    ] as const)
  ), [currentView.sections, visibleCountBySectionKey])
  const readVisibleIds = useCallback((sectionKey: SectionKey) => (
    visibleIdsBySectionKey.get(sectionKey) ?? emptyIds
  ), [visibleIdsBySectionKey])
  const readVisibleCount = useCallback((sectionKey: SectionKey) => (
    visibleCountBySectionKey.get(sectionKey) ?? 0
  ), [visibleCountBySectionKey])
  const hiddenCount = useCallback((sectionKey: SectionKey) => {
    const sectionIds = sectionIdsByKey.get(sectionKey)
    if (!sectionIds) {
      return 0
    }

    return Math.max(0, sectionIds.length - readVisibleCount(sectionKey))
  }, [readVisibleCount, sectionIdsByKey])
  const canShowMore = useCallback((sectionKey: SectionKey) => (
    hiddenCount(sectionKey) > 0
  ), [hiddenCount])
  const showMore = useCallback((sectionKey: SectionKey) => {
    if (cardsPerColumn === 'all') {
      return
    }

    setExpandedCountBySectionKey(previous => {
      const sectionIds = sectionIdsByKey.get(sectionKey)
      if (!sectionIds?.length) {
        return previous
      }

      const initialVisibleCount = resolveInitialVisibleCount(
        cardsPerColumn,
        sectionIds.length
      )
      const currentVisibleCount = previous[sectionKey] === undefined
        ? initialVisibleCount
        : Math.min(sectionIds.length, Math.max(initialVisibleCount, previous[sectionKey]!))
      const nextVisibleCount = Math.min(
        sectionIds.length,
        currentVisibleCount + cardsPerColumn
      )

      if (nextVisibleCount <= currentVisibleCount) {
        return previous
      }

      return {
        ...previous,
        [sectionKey]: nextVisibleCount
      }
    })
  }, [cardsPerColumn, sectionIdsByKey])

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
      dataView.engine.active.items.move(cardIds, {
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
    cardsPerColumn,
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
    readVisibleIds,
    readVisibleCount,
    hiddenCount,
    canShowMore,
    showMore,
    marqueeActive,
    visualTargets
  }), [
    canReorder,
    canShowMore,
    currentView,
    fillColumnColor,
    drag,
    groupUsesOptionColors,
    groupField,
    hiddenCount,
    input.columnMinHeight,
    input.columnWidth,
    cardsPerColumn,
    marqueeActive,
    fields,
    readAppearanceColorId,
    readRecord,
    readSectionColorId,
    readVisibleCount,
    readVisibleIds,
    selection,
    showMore,
    visualTargets
  ])
}
