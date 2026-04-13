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
import { mergeEntryById } from './merge'

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

const mergeEdgeOverlayEntries = (
  next: Map<EdgeId, EdgeOverlayProjection>,
  entries: readonly EdgeOverlayEntry[]
) => {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!
    mergeEntryById(next, entry.id, (current) => {
      const patch = current?.patch
        ? {
            ...current.patch,
            ...entry.patch
          }
        : entry.patch
      const activeRouteIndex = entry.activeRouteIndex ?? current?.activeRouteIndex

      return !patch && activeRouteIndex === undefined
        ? undefined
        : {
            patch,
            activeRouteIndex
          }
    })
  }
}

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
  mergeEdgeOverlayEntries(next, state.selection.edge)
  mergeEdgeOverlayEntries(next, state.edge.interaction)

  return next.size > 0
    ? next
    : EMPTY_EDGE_OVERLAY_MAP
}
