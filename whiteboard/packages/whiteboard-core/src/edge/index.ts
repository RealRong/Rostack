import {
  getAnchorFromPoint
} from '@whiteboard/core/edge/anchor'
import {
  buildEdgeCreateOperation,
  clearRoute,
  insertRoutePoint,
  moveEdge,
  moveEdgeRoute,
  moveRoutePoint,
  removeRoutePoint,
  setRoutePoints
} from '@whiteboard/core/edge/commands'
import {
  resolveAnchorFromPoint,
  resolveEdgeActivationPaddingWorld,
  resolveEdgeConnectQueryRect,
  resolveEdgeConnectTarget,
  resolveEdgeConnectThresholdWorld,
  resolveEdgeHandleSnapWorld
} from '@whiteboard/core/edge/connect'
import {
  duplicateEdgeWithMap
} from '@whiteboard/core/edge/duplicate'
import {
  resolveEdgeEnds
} from '@whiteboard/core/edge/endpoints'
import {
  isEdgePatchEqual,
  applyEdgePatch
} from '@whiteboard/core/edge/patch'
import {
  isManualEdgeRoute,
  isNodeEdgeEnd,
  isPointEdgeEnd
} from '@whiteboard/core/edge/guards'
import {
  getEdgePathBounds
} from '@whiteboard/core/edge/hitTest'
import {
  EDGE_LABEL_CENTER_TOLERANCE,
  EDGE_LABEL_DEFAULT_SIZE,
  EDGE_LABEL_HORIZONTAL_SIDE_GAP,
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_RAIL_OFFSET,
  EDGE_LABEL_TANGENT_SIDE_GAP,
  readEdgeLabelSideGap,
  resolveEdgeLabelPlacement,
  resolveEdgeLabelPlacementSize
} from '@whiteboard/core/edge/label'
import { buildEdgeLabelMaskPath } from '@whiteboard/core/edge/labelMask'
import { getEdgePath } from '@whiteboard/core/edge/path'
import { collectConnectedEdges } from '@whiteboard/core/edge/relations'
import { resolveEdgePathFromRects } from '@whiteboard/core/edge/resolvedPath'
import { readEdgeRoutePoints } from '@whiteboard/core/edge/route'
import { getSegmentBounds } from '@whiteboard/core/edge/segment'
import { resolveEdgeView } from '@whiteboard/core/edge/view'

export const edge = {
  guard: {
    isManualRoute: isManualEdgeRoute,
    isNodeEnd: isNodeEdgeEnd,
    isPointEnd: isPointEdgeEnd
  },
  route: {
    points: readEdgeRoutePoints,
    set: setRoutePoints,
    insert: insertRoutePoint,
    move: moveRoutePoint,
    remove: removeRoutePoint,
    clear: clearRoute,
    moveAll: moveEdgeRoute
  },
  path: {
    get: getEdgePath,
    bounds: getEdgePathBounds,
    fromRects: resolveEdgePathFromRects
  },
  anchor: {
    fromPoint: getAnchorFromPoint,
    resolveFromPoint: resolveAnchorFromPoint
  },
  end: {
    resolve: resolveEdgeEnds
  },
  view: {
    resolve: resolveEdgeView
  },
  hit: {
    pathBounds: getEdgePathBounds
  },
  relation: {
    collectConnected: collectConnectedEdges
  },
  segment: {
    bounds: getSegmentBounds
  },
  duplicate: {
    withMap: duplicateEdgeWithMap
  },
  command: {
    buildCreate: buildEdgeCreateOperation
  },
  edit: {
    move: moveEdge,
    moveRoute: moveEdgeRoute
  },
  connect: {
    target: resolveEdgeConnectTarget,
    thresholdWorld: resolveEdgeConnectThresholdWorld,
    handleSnapWorld: resolveEdgeHandleSnapWorld,
    activationPaddingWorld: resolveEdgeActivationPaddingWorld,
    queryRect: resolveEdgeConnectQueryRect
  },
  patch: {
    apply: applyEdgePatch,
    equal: isEdgePatchEqual
  },
  label: {
    railOffset: EDGE_LABEL_RAIL_OFFSET,
    centerTolerance: EDGE_LABEL_CENTER_TOLERANCE,
    tangentSideGap: EDGE_LABEL_TANGENT_SIDE_GAP,
    horizontalSideGap: EDGE_LABEL_HORIZONTAL_SIDE_GAP,
    lineHeight: EDGE_LABEL_LINE_HEIGHT,
    defaultSize: EDGE_LABEL_DEFAULT_SIZE,
    sideGap: readEdgeLabelSideGap,
    placementSize: resolveEdgeLabelPlacementSize,
    placement: resolveEdgeLabelPlacement,
    maskPath: buildEdgeLabelMaskPath
  }
} as const

export type {
  AnchorSnapOptions,
  ConnectMode,
  ConnectResolution,
  EdgeConnectCandidate,
  EdgeConnectConfig,
  EdgeConnectEvaluation,
  EdgeConnectResult,
  EdgeConnectTarget,
  EdgeCreateOperationResult,
  EdgeHandle,
  EdgeNodeCanvasSnapshot,
  EdgePathEnd,
  EdgePathInput,
  EdgePathResult,
  EdgePathSegment,
  EdgeRectHitMode,
  EdgeRelations,
  EdgeRouter,
  EdgeView,
  InsertRoutePointResult,
  ResolveEdgeEndsInput,
  ResolveEdgePathFromRectsInput,
  ResolvedEdgeEnd,
  ResolvedEdgeEnds,
  ResolvedEdgePathFromRects
} from '@whiteboard/core/types/edge'
