import {
  createDerivedStore,
  createValueStore,
  read,
  type ReadStore
} from '@shared/core'
import {
  readEdgeGestureOverlayState,
  readSelectionGesturePreview,
  type ActiveGesture
} from '../input/core/gesture'
import {
  EMPTY_EDGE_GUIDE,
  EMPTY_EDGE_OVERLAY,
  isEdgeGuideEqual,
  normalizeEdgeOverlayState
} from './edge'
import {
  EMPTY_NODE_HIDDEN,
  EMPTY_NODE_OVERLAY,
  isNodeOverlayStateEqual,
  normalizeNodeOverlayState
} from './node'
import {
  EMPTY_SELECTION_OVERLAY,
  isSelectionOverlayStateEqual,
  normalizeSelectionOverlayState,
  toSelectionOverlayState
} from './selection'
import type { EditorOverlay, EditorOverlayState } from './types'

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

const isEdgeGestureKind = (
  gesture: ActiveGesture | null
): gesture is Extract<ActiveGesture, {
  kind: 'edge-connect' | 'edge-move' | 'edge-route'
}> => (
  gesture?.kind === 'edge-connect'
  || gesture?.kind === 'edge-move'
  || gesture?.kind === 'edge-route'
)

const composeOverlayState = ({
  base,
  gesture
}: {
  base: EditorOverlayState
  gesture: ActiveGesture | null
}): EditorOverlayState => {
  const nextSelection = toSelectionOverlayState(
    readSelectionGesturePreview(gesture)
  )
  const nextEdge = isEdgeGestureKind(gesture)
    ? normalizeEdgeOverlayState(readEdgeGestureOverlayState(gesture))
    : base.edge

  return normalizeOverlayState({
    ...base,
    selection: nextSelection,
    edge: nextEdge
  })
}

export const createOverlayState = ({
  gesture
}: {
  gesture: Pick<ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
}): Pick<EditorOverlay, 'get' | 'subscribe' | 'set' | 'reset'> => {
  const baseState = createValueStore<EditorOverlayState>(EMPTY_OVERLAY_STATE, {
    isEqual: isOverlayStateEqual
  })
  const composedState = createDerivedStore<EditorOverlayState>({
    get: () => composeOverlayState({
      base: read(baseState),
      gesture: read(gesture)
    }),
    isEqual: isOverlayStateEqual
  })
  let current = EMPTY_OVERLAY_STATE

  return {
    get: composedState.get,
    subscribe: composedState.subscribe,
    set: (next) => {
      const resolved = typeof next === 'function'
        ? next(current)
        : next
      current = normalizeOverlayState(resolved)
      baseState.set(current)
    },
    reset: () => {
      current = EMPTY_OVERLAY_STATE
      baseState.set(EMPTY_OVERLAY_STATE)
    }
  }
}
