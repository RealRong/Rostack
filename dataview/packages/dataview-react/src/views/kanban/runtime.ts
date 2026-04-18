import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject
} from 'react'
import type {
  KanbanCardsPerColumn
} from '@dataview/core/contracts'
import type {
  ItemId as ItemIdType,
  SectionKey as SectionKeyType,
  ViewState
} from '@dataview/engine'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  createValueStore,
  read,
  sameOrder
} from '@shared/core'
import {
  elementRectIn,
  observeElementSize,
  rectIn
} from '@shared/dom'
import {
  ItemId,
  Section,
  SectionKey
} from '@dataview/engine'
import {
  buildBoardLayout,
  hitTestBoardLayout
} from '@dataview/react/views/kanban/drag'
import {
  useDrag
} from '@dataview/react/views/kanban/drag'
import type {
  KanbanBoard,
  KanbanRuntimeInput,
  KanbanSectionData,
  KanbanSectionVisibility,
  KanbanViewRuntime
} from '@dataview/react/views/kanban/types'
import {
  useItemDragRuntime,
  useRegisterMarqueeScene
} from '@dataview/react/views/shared/interactionRuntime'
import type { MarqueeScene } from '@dataview/react/page/marqueeBridge'
import {
  useMeasuredHeights
} from '@dataview/react/virtual'

const sameBoard = (
  left: KanbanBoard,
  right: KanbanBoard
) => left.viewId === right.viewId
  && left.grouped === right.grouped
  && sameOrder(left.sectionKeys, right.sectionKeys)
  && left.groupField === right.groupField
  && left.columnWidth === right.columnWidth
  && left.columnMinHeight === right.columnMinHeight
  && left.fillColumnColor === right.fillColumnColor
  && left.groupUsesOptionColors === right.groupUsesOptionColors

const sameSection = (
  left: KanbanSectionData | undefined,
  right: KanbanSectionData | undefined
) => left === right || (
  !!left
  && !!right
  && left.key === right.key
  && left.label === right.label
  && left.bucket === right.bucket
  && left.collapsed === right.collapsed
  && left.count === right.count
  && sameOrder(left.visibleIds, right.visibleIds)
  && left.visibleCount === right.visibleCount
  && left.hiddenCount === right.hiddenCount
  && left.showMoreCount === right.showMoreCount
  && left.color === right.color
)

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
  sections.map(section => [section.key, section.items.count] as const)
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
          ? resolveInitialVisibleCount(input.cardsPerColumn, section.items.count)
          : Math.min(
            section.items.count,
            Math.max(
              resolveInitialVisibleCount(input.cardsPerColumn, section.items.count),
              next[section.key]!
            )
          )

        if (
          section.items.count > previousLength
          && previousVisibleCount >= previousLength
          && currentVisibleCount < section.items.count
        ) {
          next[section.key] = section.items.count
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
        section.items.count
      )
      const expandedCount = expandedCountBySectionKey[section.key]
      const visibleCount = expandedCount === undefined
        ? initialVisibleCount
        : Math.min(section.items.count, Math.max(initialVisibleCount, expandedCount))
      const hiddenCount = Math.max(0, section.items.count - visibleCount)
      const showMoreCount = input.cardsPerColumn === 'all'
        ? hiddenCount
        : Math.min(hiddenCount, input.cardsPerColumn)

      return [
        section.key,
        {
          visibleIds: section.items.ids.slice(0, visibleCount),
          visibleCount,
          hiddenCount,
          showMoreCount
        }
      ] as const
    })
  ), [expandedCountBySectionKey, input.cardsPerColumn, input.sections])

  const sectionIdsByKey = useMemo(() => new Map(
    input.sections.map(section => [section.key, section.items.ids] as const)
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

  return useMemo(() => ({
    bySection,
    showMore
  }), [bySection, showMore])
}

const useKanbanGeometry = (input: {
  containerRef: RefObject<HTMLDivElement | null>
  sections: readonly Section[]
  visibilityBySection: ReadonlyMap<SectionKey, KanbanSectionVisibility>
}) => {
  const [bodyVersion, bumpBodyVersion] = useReducer((value: number) => value + 1, 0)
  const bodyNodeBySectionKeyRef = useRef(new Map<SectionKey, HTMLDivElement>())
  const cleanupBySectionKeyRef = useRef(new Map<SectionKey, () => void>())
  const bodyMeasureRefBySectionKeyRef = useRef(new Map<SectionKey, (node: HTMLDivElement | null) => void>())
  const visibleIds = useMemo(
    () => input.sections.flatMap(section => (
      input.visibilityBySection.get(section.key)?.visibleIds ?? section.items.ids
    )),
    [input.sections, input.visibilityBySection]
  )
  const measured = useMeasuredHeights({
    ids: visibleIds
  })

  useEffect(() => {
    const activeSectionKeys = new Set(input.sections.map(section => section.key))
    Array.from(bodyNodeBySectionKeyRef.current.keys()).forEach(sectionKey => {
      if (activeSectionKeys.has(sectionKey)) {
        return
      }

      cleanupBySectionKeyRef.current.get(sectionKey)?.()
      cleanupBySectionKeyRef.current.delete(sectionKey)
      bodyNodeBySectionKeyRef.current.delete(sectionKey)
      bodyMeasureRefBySectionKeyRef.current.delete(sectionKey)
      bumpBodyVersion()
    })
  }, [input.sections])

  useEffect(() => () => {
    cleanupBySectionKeyRef.current.forEach(cleanup => {
      cleanup()
    })
    cleanupBySectionKeyRef.current.clear()
    bodyNodeBySectionKeyRef.current.clear()
    bodyMeasureRefBySectionKeyRef.current.clear()
  }, [])

  const measureBody = useCallback((sectionKey: SectionKey) => {
    const cached = bodyMeasureRefBySectionKeyRef.current.get(sectionKey)
    if (cached) {
      return cached
    }

    const ref = (node: HTMLDivElement | null) => {
      const previousNode = bodyNodeBySectionKeyRef.current.get(sectionKey)
      if (previousNode === node) {
        return
      }

      cleanupBySectionKeyRef.current.get(sectionKey)?.()
      cleanupBySectionKeyRef.current.delete(sectionKey)

      if (!node) {
        bodyNodeBySectionKeyRef.current.delete(sectionKey)
        bumpBodyVersion()
        return
      }

      bodyNodeBySectionKeyRef.current.set(sectionKey, node)
      cleanupBySectionKeyRef.current.set(sectionKey, observeElementSize(node, {
        emitInitial: false,
        onChange: () => {
          bumpBodyVersion()
        }
      }))
      bumpBodyVersion()
    }

    bodyMeasureRefBySectionKeyRef.current.set(sectionKey, ref)
    return ref
  }, [])

  const bodyRectBySectionKey = useMemo(() => {
    const container = input.containerRef.current
    if (!container) {
      return new Map<SectionKey, ReturnType<typeof elementRectIn>>()
    }

    return new Map(
      input.sections.flatMap(section => {
        const node = bodyNodeBySectionKeyRef.current.get(section.key)
        return node
          ? [[section.key, elementRectIn(container, node)] as const]
          : []
      })
    )
  }, [bodyVersion, input.containerRef, input.sections])

  const layout = useMemo(() => buildBoardLayout({
    sections: input.sections,
    visibilityBySection: input.visibilityBySection,
    bodyRectBySectionKey,
    heightById: measured.heightById
  }), [
    bodyRectBySectionKey,
    input.sections,
    input.visibilityBySection,
    measured.heightById
  ])

  return useMemo(() => ({
    layout,
    measureCard: measured.measure,
    measureBody
  }), [
    layout,
    measured.measure,
    measureBody
  ])
}

export const useKanbanRuntime = (input: KanbanRuntimeInput): KanbanViewRuntime => {
  const dataView = useDataView()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const configStore = useMemo(() => createValueStore({
    columnWidth: input.columnWidth,
    columnMinHeight: input.columnMinHeight
  }, {
    isEqual: (left, right) => left.columnWidth === right.columnWidth
      && left.columnMinHeight === right.columnMinHeight
  }), [])
  const itemIds = input.active.items.ids
  const interaction = useItemDragRuntime({
    itemIds
  })
  const visibility = useSectionVisibility({
    viewId: input.active.view.id,
    sections: input.active.sections.all,
    cardsPerColumn: input.extra.cardsPerColumn
  })
  const visibilityStore = useMemo(() => createValueStore(visibility.bySection, {
    isEqual: Object.is
  }), [])
  const geometry = useKanbanGeometry({
    containerRef: scrollRef,
    sections: input.active.sections.all,
    visibilityBySection: visibility.bySection
  })
  const board = useMemo(() => createDerivedStore<KanbanBoard>({
    get: () => {
      const base = read(dataView.model.kanban.boardBase)
      if (!base) {
        throw new Error('Kanban board base is unavailable.')
      }

      const config = read(configStore)
      return {
        ...base,
        columnWidth: config.columnWidth,
        columnMinHeight: config.columnMinHeight
      }
    },
    isEqual: sameBoard
  }), [
    configStore,
    dataView.model.kanban.boardBase
  ])
  const section = useMemo(() => createKeyedDerivedStore<SectionKey, KanbanSectionData | undefined>({
    keyOf: key => key,
    get: key => {
      const current = read(dataView.model.kanban.sectionBase, key)
      if (!current) {
        return undefined
      }

      const currentVisibility = read(visibilityStore).get(key)
      return {
        ...current,
        visibleIds: currentVisibility?.visibleIds ?? [],
        visibleCount: currentVisibility?.visibleCount ?? 0,
        hiddenCount: currentVisibility?.hiddenCount ?? 0,
        showMoreCount: currentVisibility?.showMoreCount ?? 0
      }
    },
    isEqual: sameSection
  }), [
    dataView.model.kanban.sectionBase,
    visibilityStore
  ])
  const card = dataView.model.kanban.card
  const content = dataView.model.kanban.content

  useEffect(() => {
    configStore.set({
      columnWidth: input.columnWidth,
      columnMinHeight: input.columnMinHeight
    })
  }, [
    configStore,
    input.columnMinHeight,
    input.columnWidth
  ])
  useEffect(() => {
    visibilityStore.set(visibility.bySection)
  }, [visibility.bySection, visibilityStore])
  const marqueeScene = useMemo<MarqueeScene>(() => ({
    hitTest: rect => {
      const container = scrollRef.current
      if (!container) {
        return []
      }

      const localRect = rectIn(container, rect)
      if (!localRect) {
        return []
      }

      return hitTestBoardLayout(geometry.layout, localRect)
    }
  }), [geometry.layout])

  useRegisterMarqueeScene(marqueeScene)

  const drag = useDrag({
    containerRef: scrollRef,
    canDrag: input.extra.canReorder,
    itemMap: interaction.itemMap,
    getLayout: () => geometry.layout,
    getDragIds: interaction.getDragIds,
    onDraggingChange: interaction.onDraggingChange,
    onDrop: (cardIds, target) => {
      dataView.engine.active.items.move(cardIds, {
        section: target.sectionKey,
        ...(target.beforeItemId ? { before: target.beforeItemId } : {})
      })
    }
  })

  useEffect(() => {
    if (!drag.activeId || !drag.dragIds.length) {
      dataView.react.drag.clear()
      return
    }

    dataView.react.drag.set({
      active: true,
      kind: 'card',
      source: drag.sourceRef.current,
      pointerRef: drag.pointerRef,
      offsetRef: drag.overlayOffsetRef,
      size: {
        width: drag.overlaySize.width || Math.max(220, input.columnWidth - 32),
        height: drag.overlaySize.height
      },
      extraCount: Math.max(0, drag.dragIds.length - 1)
    })

    return () => {
      dataView.react.drag.clear()
    }
  }, [
    dataView.react.drag,
    drag.activeId,
    drag.dragIds,
    drag.overlayOffsetRef,
    drag.overlaySize.height,
    drag.overlaySize.width,
    drag.pointerRef,
    drag.sourceRef,
    input.columnWidth
  ])

  return useMemo(() => ({
    board,
    section,
    card,
    content,
    layout: {
      columnWidth: input.columnWidth,
      columnMinHeight: input.columnMinHeight
    },
    geometry: {
      measureCard: geometry.measureCard,
      measureBody: geometry.measureBody
    },
    scrollRef,
    ...interaction,
    drag,
    visibility
  }), [
    board,
    card,
    content,
    drag,
    geometry.measureBody,
    geometry.measureCard,
    input.columnMinHeight,
    input.columnWidth,
    interaction,
    section,
    visibility,
    scrollRef
  ])
}
