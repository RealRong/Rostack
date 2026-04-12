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
  View
} from '@dataview/core/contracts'
import type {
  ActiveKanbanState,
  ActiveViewState
} from '@dataview/engine'
import {
  useDataView,
  useDataViewValue
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

export type KanbanCurrentView = ActiveViewState & {
  view: View & {
    type: 'kanban'
  }
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

const readSectionLengths = (
  sections: readonly Section[]
) => new Map(
  sections.map(section => [section.key, section.ids.length] as const)
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
  columnWidth: number
  columnMinHeight: number
  currentView: KanbanCurrentView
  extra: ActiveKanbanState
}): KanbanController => {
  const dataView = useDataView()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(scrollRef.current)
  })).current
  const currentView = input.currentView
  const extra = input.extra
  const fields = extra.customFields
  const groupField = extra.groupField
  const groupUsesOptionColors = extra.groupUsesOptionColors
  const fillColumnColor = extra.fillColumnColor
  const cardsPerColumn = extra.cardsPerColumn
  const canReorder = extra.canReorder
  const [expandedCountBySectionKey, setExpandedCountBySectionKey] = useState<Partial<Record<SectionKey, number>>>({})
  const previousSectionLengthsRef = useRef(new Map<SectionKey, number>())
  const selectionValue = useDataViewValue(
    dataView => dataView.selection.store
  )
  const selectedIds = selectionValue.ids
  const selectedIdSet = useMemo<ReadonlySet<AppearanceId>>(
    () => new Set<AppearanceId>(selectedIds),
    [selectedIds]
  )
  const select = useCallback((id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.toggle([id])
      return
    }

    dataView.selection.set([id])
  }, [dataView.selection])

  const readRecord = useCallback((id: AppearanceId) => {
    return dataView.engine.active.read.getAppearanceRecord(id)
  }, [dataView.engine.active.read])
  const marqueeSession = useStoreValue(dataView.marquee.store)
  const marqueeActive = marqueeSession?.ownerViewId === currentView.view.id

  useEffect(() => {
    setExpandedCountBySectionKey({})
    previousSectionLengthsRef.current = readSectionLengths(currentView.sections)
  }, [currentView.view.id, cardsPerColumn])

  useEffect(() => {
    if (cardsPerColumn === 'all') {
      previousSectionLengthsRef.current = readSectionLengths(currentView.sections)
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

    previousSectionLengthsRef.current = readSectionLengths(currentView.sections)
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
    selectedIds,
    selectedIdSet,
    select
  }), [
    select,
    selectedIds,
    selectedIdSet,
    selectionValue
  ])
  const readSectionColorId = useCallback((sectionKey: SectionKey) => (
    groupUsesOptionColors
      ? dataView.engine.active.read.getSectionColor(sectionKey)
      : undefined
  ), [dataView.engine.active.read, groupUsesOptionColors])
  const readAppearanceColorId = useCallback((id: AppearanceId) => {
    const sectionKey = dataView.engine.active.read.getAppearanceSectionKey(id)
    return sectionKey
      ? readSectionColorId(sectionKey)
      : undefined
  }, [dataView.engine.active.read, readSectionColorId])

  const drag = useDrag({
    containerRef: scrollRef,
    canDrag: canReorder,
    itemMap: new Map(currentView.appearances.ids.map(id => [id, id] as const)),
    getLayout: () => readBoardLayout(scrollRef.current),
    getDragIds: activeId => currentViewMove.drag(
      currentView.appearances.ids,
      selectedIds,
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
    selectedIds,
    showMore,
    visualTargets
  ])
}
