import {
  createDerivedStore,
  createValueStore,
  read,
  type ReadStore
} from '@shared/core'
import {
  readEdgeGestureFeedbackState,
  readSelectionGesturePreview,
  type ActiveGesture
} from '@whiteboard/editor/input/core/gesture'
import {
  EMPTY_EDGE_GUIDE,
  EMPTY_EDGE_FEEDBACK,
  isEdgeGuideEqual,
  normalizeEdgeFeedbackState
} from '@whiteboard/editor/local/feedback/edge'
import {
  EMPTY_NODE_HIDDEN,
  EMPTY_NODE_FEEDBACK,
  isNodeFeedbackStateEqual,
  normalizeNodeFeedbackState
} from '@whiteboard/editor/local/feedback/node'
import {
  EMPTY_SELECTION_FEEDBACK,
  isSelectionFeedbackStateEqual,
  normalizeSelectionFeedbackState,
  toSelectionFeedbackState
} from '@whiteboard/editor/local/feedback/selection'
import type { EditorFeedbackRuntime, EditorFeedbackState } from '@whiteboard/editor/local/feedback/types'

const normalizeDrawFeedbackState = (
  state: EditorFeedbackState['draw']
): EditorFeedbackState['draw'] => ({
  preview: state.preview ?? null,
  hidden: state.hidden.length > 0
    ? state.hidden
    : EMPTY_NODE_HIDDEN
})

const EMPTY_FEEDBACK_STATE: EditorFeedbackState = {
  node: EMPTY_NODE_FEEDBACK,
  edge: EMPTY_EDGE_FEEDBACK,
  draw: {
    preview: null,
    hidden: EMPTY_NODE_HIDDEN
  },
  selection: EMPTY_SELECTION_FEEDBACK,
  mindmap: {}
}

const normalizeFeedbackState = (
  state: EditorFeedbackState
): EditorFeedbackState => {
  const node = normalizeNodeFeedbackState(state.node)
  const edge = normalizeEdgeFeedbackState(state.edge)
  const selection = normalizeSelectionFeedbackState(state.selection)
  const draw = normalizeDrawFeedbackState(state.draw)
  const mindmapPreview = state.mindmap.preview

  if (
    node === EMPTY_NODE_FEEDBACK
    && edge === EMPTY_EDGE_FEEDBACK
    && selection === EMPTY_SELECTION_FEEDBACK
    && draw.preview === null
    && draw.hidden === EMPTY_NODE_HIDDEN
    && mindmapPreview === undefined
  ) {
    return EMPTY_FEEDBACK_STATE
  }

  return {
    node,
    edge,
    draw,
    selection,
    mindmap: {
      preview: mindmapPreview
    }
  }
}

const isFeedbackStateEqual = (
  left: EditorFeedbackState,
  right: EditorFeedbackState
) => (
  isNodeFeedbackStateEqual(left.node, right.node)
  && left.edge.interaction === right.edge.interaction
  && isEdgeGuideEqual(left.edge.guide ?? EMPTY_EDGE_GUIDE, right.edge.guide ?? EMPTY_EDGE_GUIDE)
  && left.draw.preview === right.draw.preview
  && left.draw.hidden === right.draw.hidden
  && isSelectionFeedbackStateEqual(left.selection, right.selection)
  && left.mindmap.preview === right.mindmap.preview
)

const isEdgeGestureKind = (
  gesture: ActiveGesture | null
): gesture is Extract<ActiveGesture, {
  kind: 'edge-connect' | 'edge-move' | 'edge-label' | 'edge-route'
}> => (
  gesture?.kind === 'edge-connect'
  || gesture?.kind === 'edge-move'
  || gesture?.kind === 'edge-label'
  || gesture?.kind === 'edge-route'
)

const composeFeedbackState = ({
  base,
  gesture
}: {
  base: EditorFeedbackState
  gesture: ActiveGesture | null
}): EditorFeedbackState => {
  const nextSelection = toSelectionFeedbackState(
    readSelectionGesturePreview(gesture)
  )
  const nextEdge = isEdgeGestureKind(gesture)
    ? normalizeEdgeFeedbackState(readEdgeGestureFeedbackState(gesture))
    : base.edge

  return normalizeFeedbackState({
    ...base,
    selection: nextSelection,
    edge: nextEdge
  })
}

export const createFeedbackState = ({
  gesture
}: {
  gesture: Pick<ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
}): Pick<EditorFeedbackRuntime, 'get' | 'subscribe' | 'set' | 'reset'> => {
  const baseState = createValueStore<EditorFeedbackState>(EMPTY_FEEDBACK_STATE, {
    isEqual: isFeedbackStateEqual
  })
  const composedState = createDerivedStore<EditorFeedbackState>({
    get: () => composeFeedbackState({
      base: read(baseState),
      gesture: read(gesture)
    }),
    isEqual: isFeedbackStateEqual
  })
  let current = EMPTY_FEEDBACK_STATE

  return {
    get: composedState.get,
    subscribe: composedState.subscribe,
    set: (next) => {
      const resolved = typeof next === 'function'
        ? next(current)
        : next
      current = normalizeFeedbackState(resolved)
      baseState.set(current)
    },
    reset: () => {
      current = EMPTY_FEEDBACK_STATE
      baseState.set(EMPTY_FEEDBACK_STATE)
    }
  }
}
