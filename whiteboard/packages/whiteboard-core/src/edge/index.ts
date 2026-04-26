import { getAnchorFromPoint } from '@whiteboard/core/edge/anchor'
import {
  createEdgeOp,
  clearRoute,
  insertRoutePoint,
  moveEdge,
  moveEdgeRoute,
  moveRoutePoint,
  removeRoutePoint,
  setRoutePoints
} from '@whiteboard/core/edge/ops'
import {
  DEFAULT_EDGE_ANCHOR_OFFSET,
  resolveAnchorFromPoint,
  resolveEdgeActivationPaddingWorld,
  resolveEdgeConnectEvaluation,
  resolveEdgeConnectPreview,
  resolveEdgeConnectQueryRect,
  resolveEdgeConnectTarget,
  resolveEdgeConnectThresholdWorld,
  resolveEdgeHandleSnapWorld,
  resolveReconnectDraftEnd,
  setEdgeConnectTarget,
  startEdgeCreate,
  startEdgeReconnect,
  toEdgeConnectCommit,
  toEdgeConnectPatch,
  toEdgeDraftEnd
} from '@whiteboard/core/edge/connect'
import { createEdgeDuplicateInput } from '@whiteboard/core/edge/duplicate'
import {
  areRoutePointsEqual,
  createRoutePatchFromPathPoints,
  moveElbowRouteSegment,
  moveElbowRouteSegmentPoints,
  resolveEdgeRouteHandleTarget
} from '@whiteboard/core/edge/edit'
import {
  sameEdgeAnchor,
  sameEdgeEnd,
  sameEdgeLabel,
  sameEdgeLabels,
  sameEdgeRoute,
  sameResolvedEdgeEnd
} from '@whiteboard/core/edge/equality'
import { resolveEdgeEnds } from '@whiteboard/core/edge/endpoints'
import {
  isManualEdgeRoute,
  isNodeEdgeEnd,
  isPointEdgeEnd
} from '@whiteboard/core/edge/guards'
import {
  getEdgePathBounds,
  matchEdgeRect,
  distanceToPath
} from '@whiteboard/core/edge/hitTest'
import {
  EDGE_LABEL_CENTER_TOLERANCE,
  EDGE_LABEL_DEFAULT_SIZE,
  EDGE_LABEL_HORIZONTAL_SIDE_GAP,
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_RAIL_OFFSET,
  EDGE_LABEL_TANGENT_SIDE_GAP,
  projectPointToEdgeLabelPlacement,
  readEdgeLabelSideGap,
  resolveEdgeLabelPlacement,
  resolveEdgeLabelPlacementSize
} from '@whiteboard/core/edge/label'
import {
  buildEdgeLabelMaskRect,
  readEdgeLabelMaskTransform
} from '@whiteboard/core/edge/labelMask'
import {
  staticStyle,
  styleKey
} from '@whiteboard/core/edge/render'
import { getEdgePath } from '@whiteboard/core/edge/path'
import {
  applyEdgePatch,
  isEdgePatchEqual
} from '@whiteboard/core/edge/patch'
import {
  collectRelatedEdgeIds,
  createEdgeRelations
} from '@whiteboard/core/edge/relations'
import { resolveEdgePathFromRects } from '@whiteboard/core/edge/resolvedPath'
import { readEdgeRoutePoints } from '@whiteboard/core/edge/route'
import { getNearestEdgeInsertIndex } from '@whiteboard/core/edge/segment'
import {
  resolveEdgeView,
  resolveEdgeViewFromNodeGeometry
} from '@whiteboard/core/edge/view'

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
    snap: getAnchorFromPoint,
    fromPoint: getAnchorFromPoint,
    resolveFromPoint: resolveAnchorFromPoint
  },
  end: {
    resolve: resolveEdgeEnds
  },
  view: {
    resolve: resolveEdgeView,
    resolveFromNodeGeometry: resolveEdgeViewFromNodeGeometry
  },
  hit: {
    test: matchEdgeRect,
    pathBounds: getEdgePathBounds,
    distanceToPath
  },
  render: {
    staticStyle,
    styleKey
  },
  relation: {
    collect: collectRelatedEdgeIds,
    create: createEdgeRelations
  },
  segment: {
    insertIndex: getNearestEdgeInsertIndex
  },
  duplicate: {
    duplicate: createEdgeDuplicateInput
  },
  op: {
    create: createEdgeOp
  },
  edit: {
    move: moveEdge,
    moveRoute: moveEdgeRoute,
    routeHandleTarget: resolveEdgeRouteHandleTarget,
    routePatchFromPathPoints: createRoutePatchFromPathPoints,
    moveElbowRouteSegmentPoints,
    moveElbowRouteSegment,
    areRoutePointsEqual
  },
  connect: {
    defaultAnchorOffset: DEFAULT_EDGE_ANCHOR_OFFSET,
    resolve: resolveEdgeConnectTarget,
    evaluate: resolveEdgeConnectEvaluation,
    preview: resolveEdgeConnectPreview,
    target: resolveEdgeConnectTarget,
    thresholdWorld: resolveEdgeConnectThresholdWorld,
    handleSnapWorld: resolveEdgeHandleSnapWorld,
    activationPaddingWorld: resolveEdgeActivationPaddingWorld,
    queryRect: resolveEdgeConnectQueryRect,
    resolveReconnectDraftEnd,
    setTarget: setEdgeConnectTarget,
    startCreate: startEdgeCreate,
    startReconnect: startEdgeReconnect,
    toCommit: toEdgeConnectCommit,
    toDraftEnd: toEdgeDraftEnd,
    toPatch: toEdgeConnectPatch
  },
  patch: {
    apply: applyEdgePatch,
    equal: isEdgePatchEqual
  },
  equal: {
    anchor: sameEdgeAnchor,
    sameEnd: sameEdgeEnd,
    resolvedEnd: sameResolvedEdgeEnd,
    route: sameEdgeRoute
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
    projectPoint: projectPointToEdgeLabelPlacement,
    mask: buildEdgeLabelMaskRect,
    maskTransform: readEdgeLabelMaskTransform,
    equal: sameEdgeLabel,
    equalMany: sameEdgeLabels
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
export type {
  EdgeConnectCommit,
  EdgeConnectPreview,
  EdgeConnectState,
  EdgeDraftEnd
} from '@whiteboard/core/edge/connect'
export type { EdgeRouteHandleTarget } from '@whiteboard/core/edge/edit'
export type { EdgeLabelMaskRect } from '@whiteboard/core/edge/labelMask'
export type { EdgeStaticStyle } from '@whiteboard/core/edge/render'
export {
  resolveEdgeViewFromNodeGeometry
} from '@whiteboard/core/edge/view'
