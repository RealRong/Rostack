import type {
  ItemId
} from '@dataview/engine'
import type {
  TableGrid,
  TableViewState
} from '@dataview/runtime'
import {
  observeElementSize,
  pageScrollNode,
  scrollByClamped,
  scrollMetrics,
  viewportRect,
  type ScrollNode
} from '@shared/dom'
import { equal, store } from '@shared/core'
import type { TableLayout } from '@dataview/react/views/table/layout'
import { TableLayoutModel } from '@dataview/react/views/table/virtual/layoutModel'
import {
  createTableLayoutState,
  sameTableLayoutState,
  type TableLayoutState
} from '@dataview/react/views/table/virtual/layoutState'
import type { TableBlock } from '@dataview/react/views/table/virtual/types'
import type {
  TableBlockId
} from '@dataview/react/views/table/virtual/blockId'

const BOOTSTRAP_VIEWPORT_HEIGHT = () => (
  typeof window !== 'undefined'
    ? Math.max(0, window.innerHeight)
    : 720
)

const EMPTY_BLOCKS = [] as readonly TableBlock[]
const SCROLL_DOWN = 1 as const
const SCROLL_IDLE = 0 as const
const SCROLL_UP = -1 as const
const MEASURE_SCROLL_Y = 1 << 0
const MEASURE_LAYOUT = 1 << 1
const MEASURE_RESET_DIRECTION = 1 << 2

export type TableVerticalDirection =
  | typeof SCROLL_UP
  | typeof SCROLL_IDLE
  | typeof SCROLL_DOWN

export interface TableVirtualLayoutSnapshot {
  totalHeight: number
  revision: number
  rowCount: number
  measurementIds: readonly string[]
}

export interface TableVirtualViewportSnapshot {
  ready: boolean
  viewportTopInCanvas: number
  viewportBottomInCanvas: number
  viewportHeight: number
  verticalDirection: TableVerticalDirection
  containerWidth: number
}

export interface TableVirtualInteractionSnapshot {
  marqueeActive: boolean
  overscanBefore: number
  overscanAfter: number
}

export interface TableVirtualWindowSnapshot {
  items: readonly TableBlock[]
  totalHeight: number
  startIndex: number
  endIndex: number
  startTop: number
}

export interface TableVirtualRuntime {
  layout: store.ReadStore<TableVirtualLayoutSnapshot>
  viewport: store.ReadStore<TableVirtualViewportSnapshot>
  interaction: store.ReadStore<TableVirtualInteractionSnapshot>
  window: store.ReadStore<TableVirtualWindowSnapshot>
  locateRow: (rowId: ItemId) => {
    rowId: ItemId
    top: number
    bottom: number
  } | null
  hitRows: (input: {
    top: number
    bottom: number
  }) => readonly ItemId[]
  measurement: {
    sync: (input: {
      bucketKey: string | number
      heightById?: ReadonlyMap<string, number>
      changedHeightById?: ReadonlyMap<string, number>
      removedKeys?: readonly string[]
      reset?: boolean
    }) => void
  }
  attach: () => void
  detach: () => void
  dispose: () => void
}

const EMPTY_LAYOUT_SNAPSHOT: TableVirtualLayoutSnapshot = {
  totalHeight: 0,
  revision: 0,
  rowCount: 0,
  measurementIds: []
}

const createBootstrapViewportSnapshot = (): TableVirtualViewportSnapshot => {
  const height = BOOTSTRAP_VIEWPORT_HEIGHT()
  return {
    ready: false,
    viewportTopInCanvas: 0,
    viewportBottomInCanvas: height,
    viewportHeight: height,
    verticalDirection: SCROLL_IDLE,
    containerWidth: 0
  }
}

const EMPTY_WINDOW_SNAPSHOT: TableVirtualWindowSnapshot = {
  items: EMPTY_BLOCKS,
  totalHeight: 0,
  startIndex: 0,
  endIndex: 0,
  startTop: 0
}

const sameLayoutSnapshot = (
  left: TableVirtualLayoutSnapshot,
  right: TableVirtualLayoutSnapshot
) => left.totalHeight === right.totalHeight
  && left.revision === right.revision
  && left.rowCount === right.rowCount
  && equal.sameOrder(left.measurementIds, right.measurementIds)

const sameViewportSnapshot = (
  left: TableVirtualViewportSnapshot,
  right: TableVirtualViewportSnapshot
) => left.ready === right.ready
  && left.viewportTopInCanvas === right.viewportTopInCanvas
  && left.viewportBottomInCanvas === right.viewportBottomInCanvas
  && left.viewportHeight === right.viewportHeight
  && left.verticalDirection === right.verticalDirection
  && left.containerWidth === right.containerWidth

const sameInteractionSnapshot = (
  left: TableVirtualInteractionSnapshot,
  right: TableVirtualInteractionSnapshot
) => left.marqueeActive === right.marqueeActive
  && left.overscanBefore === right.overscanBefore
  && left.overscanAfter === right.overscanAfter

const sameWindowBlock = (
  left: TableBlock,
  right: TableBlock
) => {
  if (
    left.kind !== right.kind
    || left.key !== right.key
    || left.top !== right.top
    || left.height !== right.height
  ) {
    return false
  }

  switch (left.kind) {
    case 'row':
      return right.kind === 'row'
        && left.rowId === right.rowId
    case 'column-header':
      return right.kind === 'column-header'
        && left.scopeId === right.scopeId
        && left.label === right.label
        && left.scope.key === right.scope.key
        && left.scope.revision === right.scope.revision
        && left.scope.count === right.scope.count
    case 'column-footer':
      return right.kind === 'column-footer'
        && left.scopeId === right.scopeId
    case 'create-record':
      return right.kind === 'create-record'
        && left.sectionKey === right.sectionKey
    case 'section-header':
      return right.kind === 'section-header'
        && left.sectionKey === right.sectionKey
  }
}

const sameWindowSnapshot = (
  left: TableVirtualWindowSnapshot,
  right: TableVirtualWindowSnapshot
) => left.totalHeight === right.totalHeight
  && left.startIndex === right.startIndex
  && left.endIndex === right.endIndex
  && left.startTop === right.startTop
  && left.items.length === right.items.length
  && left.items.every((block, index) => sameWindowBlock(block, right.items[index]!))

export const resolveTableWindowOverscan = (input: {
  marqueeActive: boolean
  verticalDirection: TableVerticalDirection
}): Pick<TableVirtualInteractionSnapshot, 'overscanBefore' | 'overscanAfter'> => {
  if (!input.marqueeActive) {
    return {
      overscanBefore: 240,
      overscanAfter: 240
    }
  }

  if (input.verticalDirection > 0) {
    return {
      overscanBefore: 240,
      overscanAfter: 960
    }
  }

  if (input.verticalDirection < 0) {
    return {
      overscanBefore: 960,
      overscanAfter: 240
    }
  }

  return {
    overscanBefore: 480,
    overscanAfter: 480
  }
}

export const resolveTableWindowSnapshot = (input: {
  model: TableLayoutModel | null
  viewport: TableVirtualViewportSnapshot
  interaction: Pick<TableVirtualInteractionSnapshot, 'overscanBefore' | 'overscanAfter'>
}): TableVirtualWindowSnapshot => {
  if (!input.model) {
    return EMPTY_WINDOW_SNAPSHOT
  }

  const start = Math.max(
    0,
    input.viewport.viewportTopInCanvas - input.interaction.overscanBefore
  )
  const end = Math.max(
    start,
    input.viewport.viewportBottomInCanvas + input.interaction.overscanAfter
  )

  return input.model.materializeWindow({
    start,
    end
  })
}

const resolveMarqueeActive = (input: {
  layoutState: TableLayoutState | null
  active: boolean
}) => Boolean(
  input.layoutState
  && input.active
)

const createTableLayoutStateStore = (
  input: {
    grid: store.ReadStore<TableGrid | undefined>
    view: store.ReadStore<TableViewState | undefined>
  }
) => store.createDerivedStore<TableLayoutState | null>({
  get: () => {
    const grid = store.read(input.grid)
    const view = store.read(input.view)
    if (!grid || !view) {
      return null
    }

    const nextSections = grid.sections.ids.flatMap(sectionKey => {
      const section = grid.sections.get(sectionKey)
      return section
        ? [{
            key: section.key,
            collapsed: section.collapsed,
            itemIds: section.itemIds
          }] as const
        : []
    })

    return createTableLayoutState({
      grouped: Boolean(view.query.group),
      sections: nextSections,
      rowCount: grid.items.ids.length
    })
  },
  isEqual: sameTableLayoutState
})

export const createTableVirtualRuntime = (options: {
  grid: store.ReadStore<TableGrid | undefined>
  view: store.ReadStore<TableViewState | undefined>
  marqueeActiveStore: store.ReadStore<boolean>
  layout: TableLayout
}): TableVirtualRuntime => {
  const layoutStateStore = createTableLayoutStateStore({
    grid: options.grid,
    view: options.view
  })
  const layoutStore = store.createValueStore<TableVirtualLayoutSnapshot>({
    initial: EMPTY_LAYOUT_SNAPSHOT,
    isEqual: sameLayoutSnapshot
  })
  const viewportStore = store.createValueStore<TableVirtualViewportSnapshot>({
    initial: createBootstrapViewportSnapshot(),
    isEqual: sameViewportSnapshot
  })
  const interaction = store.createDerivedStore<TableVirtualInteractionSnapshot>({
    get: () => {
      const marqueeActive = resolveMarqueeActive({
        layoutState: store.read(layoutStateStore),
        active: store.read(options.marqueeActiveStore)
      })
      const overscan = resolveTableWindowOverscan({
        marqueeActive,
        verticalDirection: store.read(viewportStore).verticalDirection
      })

      return {
        marqueeActive,
        ...overscan
      }
    },
    isEqual: sameInteractionSnapshot
  })
  const windowStore = store.createValueStore<TableVirtualWindowSnapshot>({
    initial: EMPTY_WINDOW_SNAPSHOT,
    isEqual: sameWindowSnapshot
  })
  const measurementBuckets = new Map<string | number, Map<string, number>>()

  let attachedContainer: HTMLDivElement | null = null
  let attachedCanvas: HTMLDivElement | null = null
  let attachedScrollNode: ScrollNode | null = null
  let cleanupListeners = () => {}
  let frame: number | null = null
  let pendingMeasureFlags = 0
  let canvasTopInScrollContent: number | null = null
  let lastPageScrollTop = 0
  let currentBucketKey: string | number = '__default__'
  let currentLayoutState = layoutStateStore.get()
  let layoutRevision = 0
  let layoutModel = currentLayoutState
    ? TableLayoutModel.fromState({
        state: currentLayoutState,
        rowHeight: options.layout.rowHeight,
        headerHeight: options.layout.headerHeight,
        measuredHeights: measurementBuckets.get(currentBucketKey)
      })
    : null

  const publishLayout = () => {
    layoutStore.set(layoutModel
      ? {
          totalHeight: layoutModel.totalHeight,
          revision: layoutRevision,
          rowCount: layoutModel.rowCount,
          measurementIds: layoutModel.measurementIds
        }
      : EMPTY_LAYOUT_SNAPSHOT)
  }

  const updateWindowSnapshot = () => {
    windowStore.set(resolveTableWindowSnapshot({
      model: layoutModel,
      viewport: viewportStore.get(),
      interaction: interaction.get()
    }))
  }

  const resolveAnchor = () => {
    const viewport = viewportStore.get()
    if (!attachedScrollNode || !viewport.ready || !layoutModel) {
      return null
    }

    const projection = layoutModel.materializeWindow({
      start: viewport.viewportTopInCanvas,
      end: viewport.viewportTopInCanvas
    })
    const id = projection.items[0]?.id
    const top = id
      ? layoutModel.topOfBlock(id)
      : null

    return id && top !== null
      ? {
          id,
          top
        }
      : null
  }

  const compensateLayoutShift = (anchor: {
    id: TableBlockId
    top: number
  } | null) => {
    const scrollNode = attachedScrollNode
    const viewport = viewportStore.get()
    if (!anchor || !scrollNode || !viewport.ready || !layoutModel) {
      return
    }

    const nextTop = layoutModel.topOfBlock(anchor.id)
    if (nextTop === null) {
      return
    }

    const deltaTop = nextTop - anchor.top
    if (!deltaTop) {
      return
    }

    const moved = scrollByClamped({
      node: scrollNode,
      top: deltaTop
    })
    if (moved.top) {
      scheduleMeasure(MEASURE_SCROLL_Y | MEASURE_RESET_DIRECTION)
    }
  }

  const rebuildLayoutModel = (anchor: {
    id: TableBlockId
    top: number
  } | null = null) => {
    const nextLayoutModel = currentLayoutState
      ? (layoutModel
        ? layoutModel.sync({
            state: currentLayoutState,
            measuredHeights: measurementBuckets.get(currentBucketKey)
          })
        : TableLayoutModel.fromState({
            state: currentLayoutState,
            rowHeight: options.layout.rowHeight,
            headerHeight: options.layout.headerHeight,
            measuredHeights: measurementBuckets.get(currentBucketKey)
          }))
      : null

    if (nextLayoutModel === layoutModel) {
      publishLayout()
      updateWindowSnapshot()
      return
    }

    layoutModel = nextLayoutModel
    layoutRevision += 1
    publishLayout()
    compensateLayoutShift(anchor)
    updateWindowSnapshot()
  }

  const cancelFrame = () => {
    if (typeof window === 'undefined' || frame === null) {
      return
    }

    window.cancelAnimationFrame(frame)
    frame = null
    pendingMeasureFlags = 0
  }

  const resetViewport = () => {
    canvasTopInScrollContent = null
    lastPageScrollTop = 0
    viewportStore.set(createBootstrapViewportSnapshot())
  }

  const measureViewport = (flags: number) => {
    frame = null
    pendingMeasureFlags = 0

    const container = attachedContainer
    const canvas = attachedCanvas
    const scrollNode = attachedScrollNode
    if (!container || !canvas || !scrollNode) {
      resetViewport()
      return
    }

    const metrics = scrollMetrics(scrollNode)
    const previous = viewportStore.get()
    const deltaTop = flags & MEASURE_RESET_DIRECTION
      ? 0
      : metrics.top - lastPageScrollTop
    const verticalDirection = deltaTop > 0
      ? SCROLL_DOWN
      : deltaTop < 0
        ? SCROLL_UP
        : SCROLL_IDLE

    if (
      flags & MEASURE_LAYOUT
      || canvasTopInScrollContent === null
    ) {
      const pageViewport = viewportRect(scrollNode)
      const canvasRect = canvas.getBoundingClientRect()
      const viewportTopInCanvas = Math.max(
        0,
        metrics.top - (
          canvasRect.top
          - pageViewport.top
          + metrics.top
        )
      )

      canvasTopInScrollContent = (
        canvasRect.top
        - pageViewport.top
        + metrics.top
      )
      lastPageScrollTop = metrics.top

      viewportStore.set({
        ready: true,
        viewportTopInCanvas,
        viewportBottomInCanvas: viewportTopInCanvas + pageViewport.height,
        viewportHeight: pageViewport.height,
        verticalDirection,
        containerWidth: container.clientWidth
      })
      return
    }

    const viewportTopInCanvas = flags & MEASURE_SCROLL_Y
      ? Math.max(0, metrics.top - canvasTopInScrollContent)
      : previous.viewportTopInCanvas
    if (flags & MEASURE_SCROLL_Y) {
      lastPageScrollTop = metrics.top
    }

    viewportStore.set({
      ...previous,
      ready: true,
      viewportTopInCanvas,
      viewportBottomInCanvas: flags & MEASURE_SCROLL_Y
        ? viewportTopInCanvas + previous.viewportHeight
        : previous.viewportBottomInCanvas,
      verticalDirection: flags & MEASURE_SCROLL_Y
        ? verticalDirection
        : previous.verticalDirection
    })
  }

  const scheduleMeasure = (flags: number) => {
    if (typeof window === 'undefined') {
      measureViewport(flags)
      return
    }

    pendingMeasureFlags |= flags
    if (frame !== null) {
      return
    }

    function runTableVirtualMeasureFrame() {
      measureViewport(pendingMeasureFlags)
    }

    frame = window.requestAnimationFrame(runTableVirtualMeasureFrame)
  }

  const detach = () => {
    cancelFrame()
    cleanupListeners()
    cleanupListeners = () => {}
    attachedContainer = null
    attachedCanvas = null
    attachedScrollNode = null
    resetViewport()
  }

  const syncMeasurements = (input: {
    bucketKey: string | number
    heightById?: ReadonlyMap<string, number>
    changedHeightById?: ReadonlyMap<string, number>
    removedKeys?: readonly string[]
    reset?: boolean
  }) => {
    const anchor = resolveAnchor()
    const bucketChanged = input.bucketKey !== currentBucketKey
    const nextBucket = measurementBuckets.get(input.bucketKey) ?? new Map<string, number>()
    if (!measurementBuckets.has(input.bucketKey)) {
      measurementBuckets.set(input.bucketKey, nextBucket)
    }

    if (input.reset || bucketChanged) {
      currentBucketKey = input.bucketKey
      const activeBucket = input.heightById
        ? new Map(input.heightById)
        : nextBucket
      measurementBuckets.set(input.bucketKey, activeBucket)
      if (!layoutModel) {
        publishLayout()
        updateWindowSnapshot()
        return
      }

      const didApply = layoutModel.replaceMeasuredHeights(activeBucket)
      if (didApply) {
        layoutRevision += 1
        publishLayout()
        compensateLayoutShift(anchor)
      }
      updateWindowSnapshot()
      return
    }

    let bucketChangedData = false
    const hasPatchChanges = Boolean(
      input.changedHeightById?.size
      || input.removedKeys?.length
    )

    input.changedHeightById?.forEach((height, key) => {
      if (nextBucket.get(key) === height) {
        return
      }

      nextBucket.set(key, height)
      bucketChangedData = true
    })

    input.removedKeys?.forEach(key => {
      if (!nextBucket.has(key)) {
        return
      }

      nextBucket.delete(key)
      bucketChangedData = true
    })

    if (input.heightById && !hasPatchChanges) {
      if (nextBucket.size !== input.heightById.size) {
        bucketChangedData = true
      } else {
        for (const [key, value] of input.heightById) {
          if (nextBucket.get(key) !== value) {
            bucketChangedData = true
            break
          }
        }
      }

      if (bucketChangedData) {
        measurementBuckets.set(input.bucketKey, new Map(input.heightById))
      }
    }

    if (!bucketChangedData || !layoutModel || input.bucketKey !== currentBucketKey) {
      return
    }

    const didApply = hasPatchChanges
      ? layoutModel.applyMeasuredHeightPatches({
          changedHeights: input.changedHeightById,
          removedKeys: input.removedKeys
        })
      : layoutModel.replaceMeasuredHeights(
          measurementBuckets.get(currentBucketKey) ?? new Map<string, number>()
        )

    if (!didApply) {
      return
    }

    layoutRevision += 1
    publishLayout()
    compensateLayoutShift(anchor)
    updateWindowSnapshot()
  }

  const attach = () => {
    const nextContainer = options.layout.containerRef.current
    const nextCanvas = options.layout.canvasRef.current
    const nextScrollNode = nextContainer
      ? pageScrollNode(nextContainer)
      : null

    if (
      nextContainer === attachedContainer
      && nextCanvas === attachedCanvas
      && nextScrollNode === attachedScrollNode
    ) {
      return
    }

    cancelFrame()
    cleanupListeners()
    cleanupListeners = () => {}

    const scrollNodeChanged = nextScrollNode !== attachedScrollNode

    attachedContainer = nextContainer
    attachedCanvas = nextCanvas
    attachedScrollNode = nextScrollNode

    if (!attachedContainer || !attachedCanvas || !attachedScrollNode) {
      resetViewport()
      return
    }

    const boundScrollNode = attachedScrollNode
    const boundContainer = attachedContainer
    const boundCanvas = attachedCanvas
    const ownerWindow = boundContainer.ownerDocument.defaultView
    const handleScrollNodeScroll = () => {
      if (scrollMetrics(boundScrollNode).top === lastPageScrollTop) {
        return
      }

      scheduleMeasure(MEASURE_SCROLL_Y)
    }
    const handleLayoutChange = () => {
      scheduleMeasure(MEASURE_LAYOUT)
    }
    const unsubscribes = [
      () => {
        boundScrollNode.removeEventListener?.('scroll', handleScrollNodeScroll)
      },
      () => {
        ownerWindow?.removeEventListener('resize', handleLayoutChange)
      }
    ]

    boundScrollNode.addEventListener?.('scroll', handleScrollNodeScroll, { passive: true })
    ownerWindow?.addEventListener('resize', handleLayoutChange, { passive: true })

    unsubscribes.push(observeElementSize(boundContainer, {
      emitInitial: false,
      onChange: () => {
        handleLayoutChange()
      }
    }))
    const boundViewportElement = (
      typeof Window !== 'undefined' && boundScrollNode instanceof Window
    )
      ? null
      : boundScrollNode as HTMLElement

    if (boundViewportElement) {
      unsubscribes.push(observeElementSize(boundViewportElement, {
        emitInitial: false,
        onChange: () => {
          handleLayoutChange()
        }
      }))
    }

    cleanupListeners = store.joinUnsubscribes(unsubscribes)
    measureViewport(
      MEASURE_LAYOUT
      | (scrollNodeChanged ? MEASURE_RESET_DIRECTION : 0)
    )
  }

  const unsubscribeLayoutState = layoutStateStore.subscribe(() => {
    currentLayoutState = layoutStateStore.get()
    rebuildLayoutModel()
  })
  const unsubscribeViewport = viewportStore.subscribe(() => {
    updateWindowSnapshot()
  })
  const unsubscribeInteraction = interaction.subscribe(() => {
    updateWindowSnapshot()
  })

  publishLayout()
  updateWindowSnapshot()

  return {
    layout: layoutStore,
    viewport: viewportStore,
    interaction,
    window: windowStore,
    locateRow: rowId => layoutModel?.locateRow(rowId) ?? null,
    hitRows: input => (
      layoutModel?.materializeWindow({
        start: input.top,
        end: input.bottom
      }).items.flatMap(block => (
        block.kind === 'row'
          ? [block.rowId]
          : []
      )) ?? []
    ),
    measurement: {
      sync: syncMeasurements
    },
    attach,
    detach,
    dispose: () => {
      unsubscribeLayoutState()
      unsubscribeViewport()
      unsubscribeInteraction()
      detach()
    }
  }
}
