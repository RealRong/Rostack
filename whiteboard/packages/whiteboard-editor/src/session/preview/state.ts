import { store } from '@shared/core'
import {
  type ActiveGesture
} from '@whiteboard/editor/input/core/gesture'
import type { HoverState } from '@whiteboard/editor/input/hover/store'
import {
  EMPTY_EDGE_GUIDE,
  EMPTY_EDGE_FEEDBACK,
  isEdgeGuideEqual,
  normalizeEdgeFeedbackState
} from '@whiteboard/editor/session/preview/edge'
import {
  EMPTY_NODE_HIDDEN,
  EMPTY_NODE_FEEDBACK,
  isNodeFeedbackStateEqual,
  normalizeNodeFeedbackState
} from '@whiteboard/editor/session/preview/node'
import {
  EMPTY_SELECTION_FEEDBACK,
  EMPTY_GUIDES,
  isSelectionFeedbackStateEqual,
  normalizeSelectionFeedbackState,
} from '@whiteboard/editor/session/preview/selection'
import type {
  EditorInputPreviewState,
  EditorInputPreviewWrite
} from '@whiteboard/editor/session/preview/types'
import {
  EMPTY_EDGE_FEEDBACK_ENTRIES
} from '@whiteboard/editor/session/preview/edge'
import {
  EMPTY_NODE_PATCHES
} from '@whiteboard/editor/session/preview/node'

export const normalizeDrawFeedbackState = (
  state: EditorInputPreviewState['draw']
): EditorInputPreviewState['draw'] => ({
  preview: state.preview ?? null,
  hidden: state.hidden.length > 0
    ? state.hidden
    : EMPTY_NODE_HIDDEN
})

export const EMPTY_PREVIEW_STATE: EditorInputPreviewState = {
  node: EMPTY_NODE_FEEDBACK,
  edge: EMPTY_EDGE_FEEDBACK,
  draw: {
    preview: null,
    hidden: EMPTY_NODE_HIDDEN
  },
  selection: EMPTY_SELECTION_FEEDBACK,
  mindmap: {}
}

export const normalizeEditorInputPreviewState = (
  state: EditorInputPreviewState
): EditorInputPreviewState => {
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
    return EMPTY_PREVIEW_STATE
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

export const isEditorInputPreviewStateEqual = (
  left: EditorInputPreviewState,
  right: EditorInputPreviewState
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
  base: EditorInputPreviewState['mindmap']['preview'],
  draft: ActiveGesture['draft']['mindmap']
): EditorInputPreviewState['mindmap']['preview'] => {
  if (!base) {
    return draft
  }

  if (!draft) {
    return base
  }

  return {
    ...base,
    ...draft
  }
}

export const composeEditorInputPreviewState = ({
  base,
  gesture,
  hover
}: {
  base: EditorInputPreviewState
  gesture: ActiveGesture | null
  hover: HoverState
}): EditorInputPreviewState => {
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

  return normalizeEditorInputPreviewState({
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

export const createPreviewState = ({
  gesture,
  hover
}: {
  gesture: Pick<store.ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
  hover: Pick<store.ReadStore<HoverState>, 'get' | 'subscribe'>
}): Pick<store.ReadStore<EditorInputPreviewState>, 'get' | 'subscribe'> & EditorInputPreviewWrite => {
  const baseState = store.createValueStore<EditorInputPreviewState>(EMPTY_PREVIEW_STATE, {
    isEqual: isEditorInputPreviewStateEqual
  })
  const composedState = store.createDerivedStore<EditorInputPreviewState>({
    get: () => composeEditorInputPreviewState({
      base: store.read(baseState),
      gesture: store.read(gesture),
      hover: store.read(hover)
    }),
    isEqual: isEditorInputPreviewStateEqual
  })
  let current = EMPTY_PREVIEW_STATE

  return {
    get: composedState.get,
    subscribe: composedState.subscribe,
    set: (next) => {
      const resolved = typeof next === 'function'
        ? next(current)
        : next
      current = normalizeEditorInputPreviewState(resolved)
      baseState.set(current)
    },
    reset: () => {
      current = EMPTY_PREVIEW_STATE
      baseState.set(EMPTY_PREVIEW_STATE)
    }
  }
}
