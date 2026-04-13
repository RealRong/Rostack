import { rectFromPoints } from '@whiteboard/core/geometry'
import type { Guide } from '@whiteboard/core/node'
import type { Rect } from '@whiteboard/core/types'
import type { ViewportRuntime } from '#whiteboard-editor/local/viewport/runtime'
import {
  EMPTY_EDGE_FEEDBACK_ENTRIES
} from '#whiteboard-editor/local/feedback/edge'
import {
  EMPTY_NODE_PATCHES,
  EMPTY_NODE_SELECTION_FEEDBACK
} from '#whiteboard-editor/local/feedback/node'
import type {
  MarqueeFeedback,
  MarqueeFeedbackState,
  SelectionPreviewState,
  SelectionFeedbackState
} from '#whiteboard-editor/local/feedback/types'

export const EMPTY_GUIDES: readonly Guide[] = []

export const EMPTY_SELECTION_FEEDBACK: SelectionFeedbackState = {
  node: EMPTY_NODE_SELECTION_FEEDBACK,
  edge: EMPTY_EDGE_FEEDBACK_ENTRIES,
  guides: EMPTY_GUIDES
}

const isMarqueeFeedbackStateEqual = (
  left: MarqueeFeedbackState | undefined,
  right: MarqueeFeedbackState | undefined
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

export const isMarqueeFeedbackEqual = (
  left: MarqueeFeedback | undefined,
  right: MarqueeFeedback | undefined
) => (
  left === right
  || (
    left?.match === right?.match
    && left?.rect.x === right?.rect.x
    && left?.rect.y === right?.rect.y
    && left?.rect.width === right?.rect.width
    && left?.rect.height === right?.rect.height
  )
)

export const isSelectionFeedbackStateEqual = (
  left: SelectionFeedbackState,
  right: SelectionFeedbackState
) => (
  left.node.patches === right.node.patches
  && left.node.frameHoverId === right.node.frameHoverId
  && left.edge === right.edge
  && isMarqueeFeedbackStateEqual(left.marquee, right.marquee)
  && left.guides === right.guides
)

export const normalizeSelectionFeedbackState = (
  state: SelectionFeedbackState
): SelectionFeedbackState => {
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

export const toSelectionFeedbackState = (
  preview: SelectionPreviewState
): SelectionFeedbackState => normalizeSelectionFeedbackState({
  node: {
    patches: preview.nodePatches,
    frameHoverId: preview.frameHoverId
  },
  edge: preview.edgePatches,
  marquee: preview.marquee,
  guides: preview.guides
})

export const projectWorldRect = (
  viewport: ViewportRuntime['read'],
  worldRect: Rect
): Rect => {
  const topLeft = viewport.worldToScreen({
    x: worldRect.x,
    y: worldRect.y
  })
  const bottomRight = viewport.worldToScreen({
    x: worldRect.x + worldRect.width,
    y: worldRect.y + worldRect.height
  })

  return rectFromPoints(topLeft, bottomRight)
}
