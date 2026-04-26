import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  EdgeConnectFeedback,
  EdgeGuide,
  EdgeFeedbackEntry,
  EdgePreviewState
} from '@whiteboard/editor/session/preview/types'

export const EMPTY_EDGE_FEEDBACK_ENTRIES: readonly EdgeFeedbackEntry[] = []
export const EMPTY_EDGE_GUIDE: EdgeGuide = {}
export const EMPTY_EDGE_FEEDBACK: EdgePreviewState = {
  interaction: EMPTY_EDGE_FEEDBACK_ENTRIES
}

const isEdgeConnectFeedbackEqual = (
  left: EdgeConnectFeedback | undefined,
  right: EdgeConnectFeedback | undefined
) => {
  const leftResolution = left?.resolution
  const rightResolution = right?.resolution

  if (
    left?.focusedNodeId !== right?.focusedNodeId
    || leftResolution?.mode !== rightResolution?.mode
    || !geometryApi.equal.point(leftResolution?.pointWorld, rightResolution?.pointWorld)
  ) {
    return false
  }

  if (!leftResolution || !rightResolution) {
    return leftResolution === rightResolution
  }

  if (leftResolution.mode === 'free' || rightResolution.mode === 'free') {
    return leftResolution.mode === rightResolution.mode
  }

  if (leftResolution.nodeId !== rightResolution.nodeId) {
    return false
  }

  if (
    leftResolution.anchor.side !== rightResolution.anchor.side
    || leftResolution.anchor.offset !== rightResolution.anchor.offset
  ) {
    return false
  }

  if (leftResolution.mode === 'handle' || rightResolution.mode === 'handle') {
    return leftResolution.mode === 'handle'
      && rightResolution.mode === 'handle'
      && leftResolution.side === rightResolution.side
  }

  return true
}

const isEdgeGuidePathEqual = (
  left: EdgeGuide['path'],
  right: EdgeGuide['path']
) => (
  left?.svgPath === right?.svgPath
  && left?.style?.color === right?.style?.color
  && left?.style?.width === right?.style?.width
  && left?.style?.dash === right?.style?.dash
  && left?.style?.start === right?.style?.start
  && left?.style?.end === right?.style?.end
)

export const isEdgeGuideEqual = (
  left: EdgeGuide,
  right: EdgeGuide
) => (
  isEdgeGuidePathEqual(left.path, right.path)
  && isEdgeConnectFeedbackEqual(left.connect, right.connect)
)

const isEdgeGuideEmpty = (
  guide: EdgeGuide | undefined
) => (
  guide === undefined
  || (!guide.path && !guide.connect)
)

export const normalizeEdgeFeedbackState = (
  state: EdgePreviewState
): EdgePreviewState => {
  const interaction = state.interaction.length > 0
    ? state.interaction
    : EMPTY_EDGE_FEEDBACK_ENTRIES
  const guide = isEdgeGuideEmpty(state.guide)
    ? undefined
    : state.guide

  if (
    interaction === EMPTY_EDGE_FEEDBACK_ENTRIES
    && guide === undefined
  ) {
    return EMPTY_EDGE_FEEDBACK
  }

  return {
    interaction,
    guide
  }
}
