import { createDerivedStore, createRafKeyedStore, createRafValueStore, createValueStore, type ReadStore } from '@whiteboard/engine'
import type { Guide } from '@whiteboard/core/node'
import type { DrawPreview } from '../types/draw'
import type { EditorViewportRuntime } from './editor/types'
import {
  EMPTY_EDGE_GUIDE,
  EMPTY_EDGE_OVERLAY,
  EMPTY_EDGE_OVERLAY_MAP,
  EMPTY_EDGE_OVERLAY_PROJECTION,
  isEdgeGuideEqual,
  isEdgeProjectionEqual,
  normalizeEdgeOverlayState,
  toEdgeOverlayMap
} from './overlay/edge'
import {
  createNodeOverlayStore,
  EMPTY_NODE_HIDDEN,
  EMPTY_NODE_OVERLAY,
  isNodeOverlayStateEqual,
  isNodePatchEqual,
  normalizeNodeOverlayState,
  readNodePatchEntry,
  replaceNodePatchEntry
} from './overlay/node'
import {
  EMPTY_GUIDES,
  EMPTY_SELECTION_OVERLAY,
  isMarqueeFeedbackEqual,
  isSelectionOverlayStateEqual,
  normalizeSelectionOverlayState,
  projectWorldRect
} from './overlay/selection'
import type {
  EdgeGuide,
  EditorOverlay,
  EditorOverlayState,
  MarqueeFeedback,
  MindmapDragFeedback
} from './overlay/types'

export type {
  EdgeGuide,
  EdgeOverlayEntry,
  EdgeOverlayProjection,
  EdgeOverlayState,
  EditorOverlay,
  EditorOverlayState,
  MarqueeFeedback,
  MarqueeOverlayState,
  MindmapDragFeedback,
  NodeOverlayProjection,
  NodeOverlayState,
  NodePatch,
  NodePatchEntry,
  NodeSelectionOverlayState,
  NodeTextOverlayState,
  SelectionOverlayState
} from './overlay/types'

export {
  isNodePatchEqual,
  readNodePatchEntry,
  replaceNodePatchEntry
} from './overlay/node'

const normalizeDrawOverlayState = (
  state: EditorOverlayState['draw']
): EditorOverlayState['draw'] => ({
  preview: state.preview ?? null,
  hidden: state.hidden.length > 0
    ? state.hidden
    : EMPTY_NODE_HIDDEN
})

const EMPTY_OVERLAY_STATE: EditorOverlayState = {
  node: EMPTY_NODE_OVERLAY,
  edge: EMPTY_EDGE_OVERLAY,
  draw: {
    preview: null,
    hidden: EMPTY_NODE_HIDDEN
  },
  selection: EMPTY_SELECTION_OVERLAY,
  mindmap: {}
}

const normalizeOverlayState = (
  state: EditorOverlayState
): EditorOverlayState => {
  const node = normalizeNodeOverlayState(state.node)
  const edge = normalizeEdgeOverlayState(state.edge)
  const selection = normalizeSelectionOverlayState(state.selection)
  const draw = normalizeDrawOverlayState(state.draw)
  const mindmapDrag = state.mindmap.drag

  if (
    node === EMPTY_NODE_OVERLAY
    && edge === EMPTY_EDGE_OVERLAY
    && selection === EMPTY_SELECTION_OVERLAY
    && draw.preview === null
    && draw.hidden === EMPTY_NODE_HIDDEN
    && mindmapDrag === undefined
  ) {
    return EMPTY_OVERLAY_STATE
  }

  return {
    node,
    edge,
    draw,
    selection,
    mindmap: {
      drag: mindmapDrag
    }
  }
}

const isOverlayStateEqual = (
  left: EditorOverlayState,
  right: EditorOverlayState
) => (
  isNodeOverlayStateEqual(left.node, right.node)
  && left.edge.interaction === right.edge.interaction
  && isEdgeGuideEqual(left.edge.guide ?? EMPTY_EDGE_GUIDE, right.edge.guide ?? EMPTY_EDGE_GUIDE)
  && left.draw.preview === right.draw.preview
  && left.draw.hidden === right.draw.hidden
  && isSelectionOverlayStateEqual(left.selection, right.selection)
  && left.mindmap.drag === right.mindmap.drag
)

export const createOverlay = ({
  viewport
}: {
  viewport: Pick<EditorViewportRuntime, 'worldToScreen'> & ReadStore<unknown>
}): EditorOverlay => {
  const state = createValueStore<EditorOverlayState>(EMPTY_OVERLAY_STATE, {
    isEqual: isOverlayStateEqual
  })
  const nodeStore = createNodeOverlayStore()
  const edgeStore = createRafKeyedStore({
    emptyState: EMPTY_EDGE_OVERLAY_MAP,
    emptyValue: EMPTY_EDGE_OVERLAY_PROJECTION,
    build: toEdgeOverlayMap,
    isEqual: isEdgeProjectionEqual
  })
  const drawPreview = createRafValueStore<DrawPreview | null>({
    initial: null,
    isEqual: (left, right) => left === right
  })
  const edgeGuide = createRafValueStore<EdgeGuide>({
    initial: EMPTY_EDGE_GUIDE,
    isEqual: isEdgeGuideEqual
  })
  const mindmapDrag = createRafValueStore<MindmapDragFeedback | undefined>({
    initial: undefined,
    isEqual: (left, right) => left === right
  })
  const snapGuides = createRafValueStore<readonly Guide[]>({
    initial: EMPTY_GUIDES,
    isEqual: (left, right) => left === right
  })

  const marquee = createDerivedStore<MarqueeFeedback | undefined>({
    get: (read) => {
      const next = read(state).selection.marquee
      read(viewport)
      if (!next) {
        return undefined
      }

      return {
        rect: projectWorldRect(viewport, next.worldRect),
        match: next.match
      }
    },
    isEqual: isMarqueeFeedbackEqual
  })

  let current = EMPTY_OVERLAY_STATE

  const syncStores = (
    next: EditorOverlayState
  ) => {
    nodeStore.write(next)
    edgeStore.write(next)

    if (next.draw.preview === null) {
      drawPreview.clear()
    } else {
      drawPreview.write(next.draw.preview)
    }

    if (next.edge.guide === undefined) {
      edgeGuide.clear()
    } else {
      edgeGuide.write(next.edge.guide)
    }

    if (next.mindmap.drag === undefined) {
      mindmapDrag.clear()
    } else {
      mindmapDrag.write(next.mindmap.drag)
    }

    if (next.selection.guides === EMPTY_GUIDES) {
      snapGuides.clear()
    } else {
      snapGuides.write(next.selection.guides)
    }
  }

  const write = (
    next: EditorOverlayState
  ) => {
    const normalized = normalizeOverlayState(next)
    if (isOverlayStateEqual(current, normalized)) {
      return
    }

    current = normalized
    state.set(normalized)
    syncStores(normalized)
  }

  return {
    get: state.get,
    subscribe: state.subscribe,
    set: (next) => {
      const resolved = typeof next === 'function'
        ? next(current)
        : next
      write(resolved)
    },
    reset: () => {
      write(EMPTY_OVERLAY_STATE)
    },
    selectors: {
      node: {
        get: nodeStore.get,
        subscribe: nodeStore.subscribe
      },
      edge: {
        get: edgeStore.get,
        subscribe: edgeStore.subscribe
      },
      feedback: {
        draw: {
          get: drawPreview.get,
          subscribe: drawPreview.subscribe
        },
        marquee: {
          get: marquee.get,
          subscribe: marquee.subscribe
        },
        mindmapDrag: {
          get: mindmapDrag.get,
          subscribe: mindmapDrag.subscribe
        },
        edgeGuide: {
          get: edgeGuide.get,
          subscribe: edgeGuide.subscribe
        },
        snap: {
          get: snapGuides.get,
          subscribe: snapGuides.subscribe
        }
      }
    }
  }
}
