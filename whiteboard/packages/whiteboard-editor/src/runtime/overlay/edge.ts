import { isPointEqual } from '@whiteboard/core/geometry'
import { isEdgePatchEqual } from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import type {
  EdgeConnectFeedback,
  EdgeGuide,
  EdgeOverlayEntry,
  EdgeOverlayProjection,
  EdgeOverlayState,
  EditorOverlayState
} from './types'

export const EMPTY_EDGE_PATCHES: readonly EdgeOverlayEntry[] = []
export const EMPTY_EDGE_GUIDE: EdgeGuide = {}
export const EMPTY_EDGE_OVERLAY: EdgeOverlayState = {
  interaction: EMPTY_EDGE_PATCHES
}
export const EMPTY_EDGE_OVERLAY_PROJECTION: EdgeOverlayProjection = {}
const EMPTY_EDGE_OVERLAY_MAP = new Map<EdgeId, EdgeOverlayProjection>()

const isEdgeConnectFeedbackEqual = (
  left: EdgeConnectFeedback | undefined,
  right: EdgeConnectFeedback | undefined
) => {
  const leftResolution = left?.resolution
  const rightResolution = right?.resolution

  if (
    left?.focusedNodeId !== right?.focusedNodeId
    || leftResolution?.mode !== rightResolution?.mode
    || !isPointEqual(leftResolution?.pointWorld, rightResolution?.pointWorld)
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

const isDashEqual = (
  left: readonly number[] | undefined,
  right: readonly number[] | undefined
) => {
  if (left === right) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

const isEdgeGuidePathEqual = (
  left: EdgeGuide['path'],
  right: EdgeGuide['path']
) => (
  left?.svgPath === right?.svgPath
  && left?.style?.stroke === right?.style?.stroke
  && left?.style?.strokeWidth === right?.style?.strokeWidth
  && left?.style?.animated === right?.style?.animated
  && left?.style?.animationSpeed === right?.style?.animationSpeed
  && left?.style?.markerStart === right?.style?.markerStart
  && left?.style?.markerEnd === right?.style?.markerEnd
  && isDashEqual(left?.style?.dash, right?.style?.dash)
)

export const isEdgeGuideEqual = (
  left: EdgeGuide,
  right: EdgeGuide
) => (
  isEdgeGuidePathEqual(left.path, right.path)
  && isEdgeConnectFeedbackEqual(left.connect, right.connect)
)

export const isEdgeProjectionEqual = (
  left: EdgeOverlayProjection,
  right: EdgeOverlayProjection
) => (
  isEdgePatchEqual(left.patch, right.patch)
  && left.activeRouteIndex === right.activeRouteIndex
)

const isEdgeGuideEmpty = (
  guide: EdgeGuide | undefined
) => (
  guide === undefined
  || (!guide.path && !guide.connect)
)

export const normalizeEdgeOverlayState = (
  state: EdgeOverlayState
): EdgeOverlayState => {
  const interaction = state.interaction.length > 0
    ? state.interaction
    : EMPTY_EDGE_PATCHES
  const guide = isEdgeGuideEmpty(state.guide)
    ? undefined
    : state.guide

  if (
    interaction === EMPTY_EDGE_PATCHES
    && guide === undefined
  ) {
    return EMPTY_EDGE_OVERLAY
  }

  return {
    interaction,
    guide
  }
}

export const toEdgeOverlayMap = (
  state: EditorOverlayState
) => {
  if (
    state.selection.edge.length === 0
    && state.edge.interaction.length === 0
  ) {
    return EMPTY_EDGE_OVERLAY_MAP
  }

  const next = new Map<EdgeId, EdgeOverlayProjection>()

  const writeEntry = (
    entry: EdgeOverlayEntry
  ) => {
    const current = next.get(entry.id)
    const patch = current?.patch
      ? {
          ...current.patch,
          ...entry.patch
        }
      : entry.patch
    const activeRouteIndex = entry.activeRouteIndex ?? current?.activeRouteIndex

    if (!patch && activeRouteIndex === undefined) {
      return
    }

    next.set(entry.id, {
      patch,
      activeRouteIndex
    })
  }

  for (let index = 0; index < state.selection.edge.length; index += 1) {
    writeEntry(state.selection.edge[index]!)
  }

  for (let index = 0; index < state.edge.interaction.length; index += 1) {
    writeEntry(state.edge.interaction[index]!)
  }

  return next.size > 0
    ? next
    : EMPTY_EDGE_OVERLAY_MAP
}
