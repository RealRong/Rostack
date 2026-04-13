import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type {
  KanbanCardsPerColumn
} from '@dataview/core/contracts'
import type {
  ViewState
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
  ItemId,
  Section,
  SectionKey
} from '@dataview/engine'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import {
  createVisualTargetRegistry
} from '@dataview/react/runtime/marquee'
import { useStoreValue } from '@shared/react'
import {
  readBoardLayout
} from './drag'
import {
  useDrag
} from './drag'
import type {
  KanbanRuntimeInput,
  KanbanSectionVisibility,
  KanbanViewRuntime
} from './types'

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
  sections.map(section => [section.key, section.itemIds.length] as const)
)

const useSectionVisibility = (input: {
  viewId: ViewState['view']['id']
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
          ? resolveInitialVisibleCount(input.cardsPerColumn, section.itemIds.length)
          : Math.min(
            section.itemIds.length,
            Math.max(
              resolveInitialVisibleCount(input.cardsPerColumn, section.itemIds.length),
              next[section.key]!
            )
          )

        if (
          section.itemIds.length > previousLength
          && previousVisibleCount >= previousLength
          && currentVisibleCount < section.itemIds.length
        ) {
          next[section.key] = section.itemIds.length
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
        section.itemIds.length
      )
      const expandedCount = expandedCountBySectionKey[section.key]
      const visibleCount = expandedCount === undefined
        ? initialVisibleCount
        : Math.min(section.itemIds.length, Math.max(initialVisibleCount, expandedCount))
      const hiddenCount = Math.max(0, section.itemIds.length - visibleCount)
      const showMoreCount = input.cardsPerColumn === 'all'
        ? hiddenCount
        : Math.min(hiddenCount, input.cardsPerColumn)

      return [
        section.key,
        {
          visibleIds: section.itemIds.slice(0, visibleCount),
          visibleCount,
          hiddenCount,
          showMoreCount
        }
      ] as const
    })
  ), [expandedCountBySectionKey, input.cardsPerColumn, input.sections])

  const sectionIdsByKey = useMemo(() => new Map(
    input.sections.map(section => [section.key, section.itemIds] as const)
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

export const useKanbanRuntime = (input: KanbanRuntimeInput): KanbanViewRuntime => {
  const dataView = useDataView()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const visualTargets = useRef(createVisualTargetRegistry({
    resolveScrollTargets: () => resolveDefaultAutoPanTargets(scrollRef.current)
  })).current
  const itemIds = input.active.items.ids
  const selectionValue = useDataViewValue(
    dataView => dataView.selection.store
  )
  const selectedIds = selectionValue.ids
  const selectedIdSet = useMemo<ReadonlySet<ItemId>>(
    () => new Set(selectedIds),
    [selectedIds]
  )
  const select = useCallback((id: ItemId, mode: 'replace' | 'toggle' = 'replace') => {
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
    sections: input.active.sections.all,
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
      getTargets: () => visualTargets.getTargets(itemIds),
      order: () => itemIds,
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
    itemIds,
    dataView.marquee,
    dragging,
    input.active.view.id,
    visualTargets
  ])

  const drag = useDrag({
    containerRef: scrollRef,
    canDrag: input.extra.canReorder,
    itemMap: new Map(itemIds.map(id => [id, id] as const)),
    getLayout: () => readBoardLayout(scrollRef.current),
    getDragIds: activeId => (
      selectedIds.includes(activeId)
        ? selectedIds.filter(id => itemIds.includes(id))
        : [activeId]
    ),
    onDraggingChange: setDragging,
    onDrop: (cardIds, target) => {
      dataView.engine.active.items.move(cardIds, {
        section: target.sectionKey,
        ...(target.beforeItemId ? { before: target.beforeItemId } : {})
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
