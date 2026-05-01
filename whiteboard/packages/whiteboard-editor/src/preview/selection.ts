import type { Guide } from '@whiteboard/core/node'
import {
  EMPTY_EDGE_FEEDBACK_ENTRIES
} from '@whiteboard/editor/session/preview/edge'
import {
  EMPTY_NODE_PATCHES,
  EMPTY_NODE_SELECTION_FEEDBACK
} from '@whiteboard/editor/session/preview/node'
import type {
  MarqueePreviewState,
  SelectionPreviewState
} from '@whiteboard/editor/session/preview/types'

export const EMPTY_GUIDES: readonly Guide[] = []

export const EMPTY_SELECTION_FEEDBACK: SelectionPreviewState = {
  node: EMPTY_NODE_SELECTION_FEEDBACK,
  edge: EMPTY_EDGE_FEEDBACK_ENTRIES,
  guides: EMPTY_GUIDES
}

const isMarqueeFeedbackStateEqual = (
  left: MarqueePreviewState | undefined,
  right: MarqueePreviewState | undefined
) => (
  left === right
  || (
    left?.match === right?.match
    && left?.worldRect.x === right?.worldRect.x
    && left?.worldRect.y === right?.worldRect.y
    && left?.worldRect.width === right?.worldRect.width
    && left?.worldRect.height === right?.worldRect.height
  )
)

export const isSelectionFeedbackStateEqual = (
  left: SelectionPreviewState,
  right: SelectionPreviewState
) => (
  left.node.patches === right.node.patches
  && left.node.frameHoverId === right.node.frameHoverId
  && left.edge === right.edge
  && isMarqueeFeedbackStateEqual(left.marquee, right.marquee)
  && left.guides === right.guides
)

export const normalizeSelectionFeedbackState = (
  state: SelectionPreviewState
): SelectionPreviewState => {
  const nodePatches = state.node.patches.length > 0
    ? state.node.patches
    : EMPTY_NODE_PATCHES
  const edge = state.edge.length > 0
    ? state.edge
    : EMPTY_EDGE_FEEDBACK_ENTRIES
  const guides = state.guides.length > 0
    ? state.guides
    : EMPTY_GUIDES
  const marquee = state.marquee

  if (
    nodePatches === EMPTY_NODE_PATCHES
    && state.node.frameHoverId === undefined
    && edge === EMPTY_EDGE_FEEDBACK_ENTRIES
    && guides === EMPTY_GUIDES
    && marquee === undefined
  ) {
    return EMPTY_SELECTION_FEEDBACK
  }

  return {
    node:
      nodePatches === EMPTY_NODE_PATCHES && state.node.frameHoverId === undefined
        ? EMPTY_NODE_SELECTION_FEEDBACK
        : {
            patches: nodePatches,
            frameHoverId: state.node.frameHoverId
          },
    edge,
    marquee,
    guides
  }
}
