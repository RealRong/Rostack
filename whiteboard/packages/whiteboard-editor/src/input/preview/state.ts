import {
  createDerivedStore,
  createValueStore,
  read,
  type ReadStore
} from '@shared/core'
import {
  type ActiveGesture
} from '@whiteboard/editor/input/core/gesture'
import type { HoverState } from '@whiteboard/editor/input/hover/store'
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
  EMPTY_GUIDES,
  isSelectionFeedbackStateEqual,
  normalizeSelectionFeedbackState,
} from '@whiteboard/editor/local/feedback/selection'
import type { EditorFeedbackRuntime, EditorFeedbackState } from '@whiteboard/editor/local/feedback/types'
import {
  EMPTY_EDGE_FEEDBACK_ENTRIES
} from '@whiteboard/editor/local/feedback/edge'
import {
  EMPTY_NODE_PATCHES
} from '@whiteboard/editor/local/feedback/node'

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

const mergeMindmapPreview = (
  base: EditorFeedbackState['mindmap']['preview'],
  draft: ActiveGesture['draft']['mindmap']
): EditorFeedbackState['mindmap']['preview'] => {
  if (!base) {
    return draft
  }

  if (!draft) {
    return base
  }

  return {
    ...base,
    ...draft,
    enter: draft.enter ?? base.enter
  }
}

const composeFeedbackState = ({
  base,
  gesture,
  hover
}: {
  base: EditorFeedbackState
  gesture: ActiveGesture | null
  hover: HoverState
}): EditorFeedbackState => {
  const draft = gesture?.draft
  const nextSelection = normalizeSelectionFeedbackState({
    node: {
      patches: draft?.nodePatches ?? EMPTY_NODE_PATCHES,
      frameHoverId: draft?.frameHoverId
    },
    edge: draft?.edgePatches ?? EMPTY_EDGE_FEEDBACK_ENTRIES,
    marquee: draft?.marquee,
    guides: draft?.guides ?? EMPTY_GUIDES
  })
  const nextEdge = normalizeEdgeFeedbackState({
    interaction: EMPTY_EDGE_FEEDBACK.interaction,
    guide: draft?.edgeGuide ?? hover.edgeGuide
  })

  return normalizeFeedbackState({
    ...base,
    draw: normalizeDrawFeedbackState({
      preview: draft?.drawPreview ?? null,
      hidden: draft?.hiddenNodeIds ?? EMPTY_NODE_HIDDEN
    }),
    selection: nextSelection,
    edge: nextEdge,
    mindmap: {
      preview: mergeMindmapPreview(
        base.mindmap.preview,
        draft?.mindmap
      )
    }
  })
}

export const createFeedbackState = ({
  gesture,
  hover
}: {
  gesture: Pick<ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
  hover: Pick<ReadStore<HoverState>, 'get' | 'subscribe'>
}): Pick<EditorFeedbackRuntime, 'get' | 'subscribe' | 'set' | 'reset'> => {
  const baseState = createValueStore<EditorFeedbackState>(EMPTY_FEEDBACK_STATE, {
    isEqual: isFeedbackStateEqual
  })
  const composedState = createDerivedStore<EditorFeedbackState>({
    get: () => composeFeedbackState({
      base: read(baseState),
      gesture: read(gesture),
      hover: read(hover)
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
