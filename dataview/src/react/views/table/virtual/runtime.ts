import type { ActiveViewState as CurrentView } from '@dataview/engine'
import type {
  AppearanceId
} from '@dataview/engine/project'
import type {
  MarqueeSessionState
} from '@dataview/react/runtime/marquee'
import {
  observeElementSize,
  pageScrollNode,
  scrollMetrics,
  viewportRect,
  type ScrollNode
} from '@shared/dom'
import {
  createDerivedStore,
  createValueStore,
  joinUnsubscribes,
  read,
  type ReadStore
} from '@shared/core'
import {
  sameOrder
} from '@shared/core'
import {
  findVirtualBlockEndIndex,
  findVirtualBlockStartIndex
} from '../../../virtual/math'
import {
  contentBounds,
  type TableLayout
} from '../layout'
import {
  buildTableBlocks
} from './buildBlocks'
import type {
  TableBlock
} from './types'

const BOOTSTRAP_VIEWPORT_HEIGHT = () => (
  typeof window !== 'undefined'
    ? Math.max(0, window.innerHeight)
    : 720
)

const BOOTSTRAP_VIEWPORT_WIDTH = () => (
  typeof window !== 'undefined'
    ? Math.max(0, window.innerWidth)
    : 1280
)

const EMPTY_BLOCKS = [] as readonly TableBlock[]
const SCROLL_DOWN = 1 as const
const SCROLL_IDLE = 0 as const
const SCROLL_UP = -1 as const

export type TableVerticalDirection =
  | typeof SCROLL_UP
  | typeof SCROLL_IDLE
  | typeof SCROLL_DOWN

export interface TableVirtualLayoutSnapshot {
  blocks: readonly TableBlock[]
  totalHeight: number
}

export interface TableVirtualViewportSnapshot {
  ready: boolean
  viewportTopInCanvas: number
  viewportBottomInCanvas: number
  viewportHeight: number
  viewportWidth: number
  pageScrollTop: number
  verticalDirection: TableVerticalDirection
  scrollLeft: number
  containerWidth: number
  containerHeight: number
  contentLeft: number
  contentRight: number
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
  layout: ReadStore<TableVirtualLayoutSnapshot>
  viewport: ReadStore<TableVirtualViewportSnapshot>
  interaction: ReadStore<TableVirtualInteractionSnapshot>
  window: ReadStore<TableVirtualWindowSnapshot>
  attach: () => void
  detach: () => void
  dispose: () => void
}

const EMPTY_LAYOUT_SNAPSHOT: TableVirtualLayoutSnapshot = {
  blocks: EMPTY_BLOCKS,
  totalHeight: 0
}

const createBootstrapViewportSnapshot = (): TableVirtualViewportSnapshot => {
  const height = BOOTSTRAP_VIEWPORT_HEIGHT()
  return {
    ready: false,
    viewportTopInCanvas: 0,
    viewportBottomInCanvas: height,
    viewportHeight: height,
    viewportWidth: BOOTSTRAP_VIEWPORT_WIDTH(),
    pageScrollTop: 0,
    verticalDirection: SCROLL_IDLE,
    scrollLeft: 0,
    containerWidth: 0,
    containerHeight: 0,
    contentLeft: 0,
    contentRight: 0
  }
}

const EMPTY_WINDOW_SNAPSHOT: TableVirtualWindowSnapshot = {
  items: EMPTY_BLOCKS,
  totalHeight: 0,
  startIndex: 0,
  endIndex: 0,
  startTop: 0
}

const totalHeightOf = (
  blocks: readonly TableBlock[]
) => {
  const last = blocks[blocks.length - 1]
  return last
    ? last.top + last.height
    : 0
}

const sameBlock = (
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
        && sameOrder(left.rowIds, right.rowIds)
    case 'column-footer':
      return right.kind === 'column-footer'
        && left.scopeId === right.scopeId
    case 'section-header':
      return right.kind === 'section-header'
        && left.section.key === right.section.key
        && left.section.title === right.section.title
        && left.section.collapsed === right.section.collapsed
        && sameOrder(left.section.appearanceIds, right.section.appearanceIds)
  }
}

const sameBlocks = (
  left: readonly TableBlock[],
  right: readonly TableBlock[]
) => sameOrder(left, right, sameBlock)

const sameLayoutSnapshot = (
  left: TableVirtualLayoutSnapshot,
  right: TableVirtualLayoutSnapshot
) => left.totalHeight === right.totalHeight
  && sameBlocks(left.blocks, right.blocks)

const sameViewportSnapshot = (
  left: TableVirtualViewportSnapshot,
  right: TableVirtualViewportSnapshot
) => left.ready === right.ready
  && left.viewportTopInCanvas === right.viewportTopInCanvas
  && left.viewportBottomInCanvas === right.viewportBottomInCanvas
  && left.viewportHeight === right.viewportHeight
  && left.viewportWidth === right.viewportWidth
  && left.pageScrollTop === right.pageScrollTop
  && left.verticalDirection === right.verticalDirection
  && left.scrollLeft === right.scrollLeft
  && left.containerWidth === right.containerWidth
  && left.containerHeight === right.containerHeight
  && left.contentLeft === right.contentLeft
  && left.contentRight === right.contentRight

const sameInteractionSnapshot = (
  left: TableVirtualInteractionSnapshot,
  right: TableVirtualInteractionSnapshot
) => left.marqueeActive === right.marqueeActive
  && left.overscanBefore === right.overscanBefore
  && left.overscanAfter === right.overscanAfter

const sameWindowSnapshot = (
  left: TableVirtualWindowSnapshot,
  right: TableVirtualWindowSnapshot
) => left.totalHeight === right.totalHeight
  && left.startIndex === right.startIndex
  && left.endIndex === right.endIndex
  && left.startTop === right.startTop
  && sameBlocks(left.items, right.items)

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
  layout: TableVirtualLayoutSnapshot
  viewport: TableVirtualViewportSnapshot
  interaction: Pick<TableVirtualInteractionSnapshot, 'overscanBefore' | 'overscanAfter'>
}): TableVirtualWindowSnapshot => {
  if (!input.layout.blocks.length) {
    return {
      ...EMPTY_WINDOW_SNAPSHOT,
      totalHeight: input.layout.totalHeight
    }
  }

  const start = Math.max(
    0,
    input.viewport.viewportTopInCanvas - input.interaction.overscanBefore
  )
  const end = Math.max(
    start,
    input.viewport.viewportBottomInCanvas + input.interaction.overscanAfter
  )
  const startIndex = findVirtualBlockStartIndex(input.layout.blocks, start)
  const endIndex = Math.max(
    startIndex,
    findVirtualBlockEndIndex(input.layout.blocks, end)
  )
  const items = input.layout.blocks.slice(startIndex, endIndex)

  return {
    items,
    totalHeight: input.layout.totalHeight,
    startIndex,
    endIndex,
    startTop: items[0]?.top ?? 0
  }
}

const resolveLayoutSnapshot = (input: {
  currentView: CurrentView | undefined
  rowHeight: number
  headerHeight: number
}): TableVirtualLayoutSnapshot => {
  if (!input.currentView) {
    return EMPTY_LAYOUT_SNAPSHOT
  }

  const grouped = Boolean(input.currentView.view.group)
  const blocks = buildTableBlocks({
    grouped,
    rowIds: input.currentView.appearances.ids,
    sections: input.currentView.sections.all,
    rowHeight: input.rowHeight,
    headerHeight: input.headerHeight
  })

  return {
    blocks,
    totalHeight: totalHeightOf(blocks)
  }
}

const resolveMarqueeActive = (input: {
  currentView: CurrentView | undefined
  session: MarqueeSessionState | null
}) => Boolean(
  input.currentView
  && input.session
  && input.session.ownerViewId === input.currentView.view.id
)

export const createTableVirtualRuntime = (options: {
  currentViewStore: ReadStore<CurrentView | undefined>
  marqueeStore: ReadStore<MarqueeSessionState | null>
  layout: TableLayout
}): TableVirtualRuntime => {
  const layout = createDerivedStore<TableVirtualLayoutSnapshot>({
    get: () => resolveLayoutSnapshot({
      currentView: read(options.currentViewStore),
      rowHeight: options.layout.rowHeight,
      headerHeight: options.layout.headerHeight
    }),
    isEqual: sameLayoutSnapshot
  })
  const viewportStore = createValueStore<TableVirtualViewportSnapshot>({
    initial: createBootstrapViewportSnapshot(),
    isEqual: sameViewportSnapshot
  })
  const interaction = createDerivedStore<TableVirtualInteractionSnapshot>({
    get: () => {
      const marqueeActive = resolveMarqueeActive({
        currentView: read(options.currentViewStore),
        session: read(options.marqueeStore)
      })
      const overscan = resolveTableWindowOverscan({
        marqueeActive,
        verticalDirection: read(viewportStore).verticalDirection
      })

      return {
        marqueeActive,
        ...overscan
      }
    },
    isEqual: sameInteractionSnapshot
  })
  const windowStore = createDerivedStore<TableVirtualWindowSnapshot>({
    get: () => resolveTableWindowSnapshot({
      layout: read(layout),
      viewport: read(viewportStore),
      interaction: read(interaction)
    }),
    isEqual: sameWindowSnapshot
  })

  let attachedContainer: HTMLDivElement | null = null
  let attachedCanvas: HTMLDivElement | null = null
  let attachedScrollNode: ScrollNode | null = null
  let cleanupListeners = () => {}
  let frame: number | null = null

  const cancelFrame = () => {
    if (typeof window === 'undefined' || frame === null) {
      return
    }

    window.cancelAnimationFrame(frame)
    frame = null
  }

  const resetViewport = () => {
    viewportStore.set(createBootstrapViewportSnapshot())
  }

  const measureViewport = (scrollNodeChanged: boolean) => {
    frame = null

    const container = attachedContainer
    const canvas = attachedCanvas
    const scrollNode = attachedScrollNode
    if (!container || !canvas || !scrollNode) {
      resetViewport()
      return
    }

    const pageViewport = viewportRect(scrollNode)
    const metrics = scrollMetrics(scrollNode)
    const bounds = contentBounds({
      container,
      canvas
    })
    const canvasRect = canvas.getBoundingClientRect()
    const previous = viewportStore.get()
    const deltaTop = scrollNodeChanged
      ? 0
      : metrics.top - previous.pageScrollTop

    viewportStore.set({
      ready: true,
      viewportTopInCanvas: Math.max(0, pageViewport.top - canvasRect.top),
      viewportBottomInCanvas: Math.max(
        0,
        pageViewport.bottom - canvasRect.top
      ),
      viewportHeight: pageViewport.height,
      viewportWidth: pageViewport.width,
      pageScrollTop: metrics.top,
      verticalDirection: deltaTop > 0
        ? SCROLL_DOWN
        : deltaTop < 0
          ? SCROLL_UP
          : SCROLL_IDLE,
      scrollLeft: container.scrollLeft,
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      contentLeft: bounds?.left ?? 0,
      contentRight: bounds?.right ?? 0
    })
  }

  const scheduleMeasure = (scrollNodeChanged = false) => {
    if (
      typeof window === 'undefined'
      || frame !== null
    ) {
      if (typeof window === 'undefined') {
        measureViewport(scrollNodeChanged)
      }
      return
    }

    frame = window.requestAnimationFrame(() => {
      measureViewport(scrollNodeChanged)
    })
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
    const handleChange = () => {
      scheduleMeasure(false)
    }
    const unsubscribes = [
      () => {
        boundScrollNode.removeEventListener?.('scroll', handleChange)
      },
      () => {
        boundContainer.removeEventListener?.('scroll', handleChange)
      },
      () => {
        ownerWindow?.removeEventListener('resize', handleChange)
      }
    ]

    boundScrollNode.addEventListener?.('scroll', handleChange, { passive: true })
    boundContainer.addEventListener?.('scroll', handleChange, { passive: true })
    ownerWindow?.addEventListener('resize', handleChange, { passive: true })

    unsubscribes.push(observeElementSize(boundContainer, {
      emitInitial: false,
      onChange: () => {
        scheduleMeasure(false)
      }
    }))
    unsubscribes.push(observeElementSize(boundCanvas, {
      emitInitial: false,
      onChange: () => {
        scheduleMeasure(false)
      }
    }))

    cleanupListeners = joinUnsubscribes(unsubscribes)
    measureViewport(scrollNodeChanged)
  }

  return {
    layout,
    viewport: viewportStore,
    interaction,
    window: windowStore,
    attach,
    detach,
    dispose: detach
  }
}
