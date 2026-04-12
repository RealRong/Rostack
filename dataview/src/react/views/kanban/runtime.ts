import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type {
  KanbanCardsPerColumn,
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
  dataviewAppearanceSelector
} from '@dataview/react/dom/appearance'
import {
  closestTarget,
  interactiveSelector
} from '@shared/dom'
import {
  move as viewMove
} from '@dataview/engine/project'
import type {
  AppearanceId,
  Section,
  SectionKey
} from '@dataview/engine/project'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import {
  createVisualTargetRegistry,
  type VisualTargetRegistry
} from '@dataview/react/runtime/marquee'
import { useStoreValue } from '@shared/react'
import {
  readBoardLayout
} from './drag'
import {
  useDrag
} from './drag'

export type KanbanActiveState = ActiveViewState & {
  view: View & {
    type: 'kanban'
  }
}

export interface KanbanSectionVisibility {
  visibleIds: readonly AppearanceId[]
  visibleCount: number
  hiddenCount: number
  showMoreCount: number
}

export interface KanbanRuntime {
  layout: {
    columnWidth: number
    columnMinHeight: number
  }
  scrollRef: RefObject<HTMLDivElement | null>
  selection: {
    selectedIdSet: ReadonlySet<AppearanceId>
    select: (id: AppearanceId, mode?: 'replace' | 'toggle') => void
  }
  drag: ReturnType<typeof useDrag>
  marqueeActive: boolean
  visualTargets: VisualTargetRegistry
  visibility: {
    bySection: ReadonlyMap<SectionKey, KanbanSectionVisibility>
    showMore: (sectionKey: SectionKey) => void
  }
}

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

const useSectionVisibility = (input: {
  viewId: View['id']
  sections: readonly Section[]
  cardsPerColumn: KanbanCardsPerColumn
}) => {
  const [expandedCountBySectionKey, setExpandedCountBySectionKey] = useState<Partial<Record<SectionKey, number>>>({})
  const previousSectionLengthsRef = useRef(new Map<SectionKey, number>())

  useEffect(() => {
    setExpandedCountBySectionKey({})
    previousSectionLengthsRef.current = readSectionLengths(input.sections)
  }, [input.cardsPerColumn, input.viewId])

  useEffect(() => {
    if (input.cardsPerColumn === 'all') {
      previousSectionLengthsRef.current = readSectionLengths(input.sections)
      return
    }

    setExpandedCountBySectionKey(previous => {
      let changed = false
      const next = {
        ...previous
      }
      const previousLengths = previousSectionLengthsRef.current
      const sectionKeys = new Set(input.sections.map(section => section.key))

      Object.keys(next).forEach(sectionKey => {
        if (!sectionKeys.has(sectionKey)) {
          delete next[sectionKey]
          changed = true
        }
      })

      input.sections.forEach(section => {
        const previousLength = previousLengths.get(section.key)
        if (previousLength === undefined) {
          return
        }

        const previousInitialVisibleCount = resolveInitialVisibleCount(
          input.cardsPerColumn,
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
          ? resolveInitialVisibleCount(input.cardsPerColumn, section.ids.length)
          : Math.min(
            section.ids.length,
            Math.max(
              resolveInitialVisibleCount(input.cardsPerColumn, section.ids.length),
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

    previousSectionLengthsRef.current = readSectionLengths(input.sections)
  }, [input.cardsPerColumn, input.sections])

  const bySection = useMemo(() => new Map(
    input.sections.map(section => {
      const initialVisibleCount = resolveInitialVisibleCount(
        input.cardsPerColumn,
        section.ids.length
      )
      const expandedCount = expandedCountBySectionKey[section.key]
      const visibleCount = expandedCount === undefined
        ? initialVisibleCount
        : Math.min(section.ids.length, Math.max(initialVisibleCount, expandedCount))
      const hiddenCount = Math.max(0, section.ids.length - visibleCount)
      const showMoreCount = input.cardsPerColumn === 'all'
        ? hiddenCount
        : Math.min(hiddenCount, input.cardsPerColumn)

      return [
        section.key,
        {
          visibleIds: section.ids.slice(0, visibleCount),
          visibleCount,
          hiddenCount,
          showMoreCount
        }
      ] as const
    })
  ), [expandedCountBySectionKey, input.cardsPerColumn, input.sections])

  const sectionIdsByKey = useMemo(() => new Map(
    input.sections.map(section => [section.key, section.ids] as const)
  ), [input.sections])

  const showMore = useCallback((sectionKey: SectionKey) => {
    const step = input.cardsPerColumn
    if (step === 'all') {
      return
    }

    setExpandedCountBySectionKey(previous => {
      const sectionIds = sectionIdsByKey.get(sectionKey)
      if (!sectionIds?.length) {
        return previous
      }

      const initialVisibleCount = resolveInitialVisibleCount(
        input.cardsPerColumn,
        sectionIds.length
      )
      const currentVisibleCount = previous[sectionKey] === undefined
        ? initialVisibleCount
        : Math.min(sectionIds.length, Math.max(initialVisibleCount, previous[sectionKey]!))
      const nextVisibleCount = Math.min(
        sectionIds.length,
        currentVisibleCount + step
      )

      if (nextVisibleCount <= currentVisibleCount) {
        return previous
      }

      return {
        ...previous,
        [sectionKey]: nextVisibleCount
      }
    })
  }, [input.cardsPerColumn, sectionIdsByKey])

  return {
    bySection,
    showMore
  }
}

export const useKanbanRuntime = (input: {
  columnWidth: number
  columnMinHeight: number
  active: KanbanActiveState
  extra: ActiveKanbanState
}): KanbanRuntime => {
  const dataView = useDataView()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(scrollRef.current)
  })).current
  const appearanceIds = input.active.appearances.ids
  const selectionValue = useDataViewValue(
    dataView => dataView.selection.store
  )
  const selectedIds = selectionValue.ids
  const selectedIdSet = useMemo<ReadonlySet<AppearanceId>>(
    () => new Set(selectedIds),
    [selectedIds]
  )
  const select = useCallback((id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.toggle([id])
      return
    }

    dataView.selection.set([id])
  }, [dataView.selection])
  const marqueeSession = useStoreValue(dataView.marquee.store)
  const marqueeActive = marqueeSession?.ownerViewId === input.active.view.id
  const visibility = useSectionVisibility({
    viewId: input.active.view.id,
    sections: input.active.sections,
    cardsPerColumn: input.extra.cardsPerColumn
  })

  useEffect(() => {
    return dataView.marquee.registerAdapter({
      viewId: input.active.view.id,
      disabled: dragging,
      canStart: (event: PointerEvent) => !closestTarget(event.target, [
        dataviewAppearanceSelector,
        interactiveSelector
      ].join(',')),
      getTargets: () => visualTargets.getTargets(appearanceIds),
      order: () => appearanceIds,
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
    appearanceIds,
    dataView.marquee,
    dragging,
    input.active.view.id,
    visualTargets
  ])

  const drag = useDrag({
    containerRef: scrollRef,
    canDrag: input.extra.canReorder,
    itemMap: new Map(appearanceIds.map(id => [id, id] as const)),
    getLayout: () => readBoardLayout(scrollRef.current),
    getDragIds: activeId => viewMove.drag(
      appearanceIds,
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
    layout: {
      columnWidth: input.columnWidth,
      columnMinHeight: input.columnMinHeight
    },
    scrollRef,
    selection: {
      selectedIdSet,
      select
    },
    drag,
    marqueeActive,
    visualTargets,
    visibility
  }), [
    drag,
    input.columnMinHeight,
    input.columnWidth,
    marqueeActive,
    select,
    selectedIdSet,
    visibility,
    visualTargets
  ])
}
