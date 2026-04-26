import {
  resolveNodeBootstrapSize,
  resolveTextNodeBootstrapSize,
  TEXT_BOOTSTRAP_SIZE
} from '@whiteboard/core/node/bootstrap'
import {
  createNodeOp,
  planNodeAlignOps,
  planNodeDistributeOps
} from '@whiteboard/core/node/ops'
import {
  matchDrawRect,
  readDrawBaseSize,
  readDrawPoints,
  resolveDrawPoints,
  resolveDrawStroke
} from '@whiteboard/core/node/draw'
import {
  createFrameQuery,
  frameAt,
  frameChildren,
  frameDescendants,
  frameParent,
  pickFrame,
  pickFrameParent
} from '@whiteboard/core/node/frame'
import {
  getNodeAABB,
  getNodeBoundsByNode,
  getNodeRect,
  getNodesBounds,
  readNodeRotation
} from '@whiteboard/core/node/geometry'
import {
  getNodesBoundingRect,
  rectEquals
} from '@whiteboard/core/node/group'
import {
  filterNodeIdsInRect,
  getNodeIdsInRect,
  matchCanvasNodeRect
} from '@whiteboard/core/node/hitTest'
import {
  alignNodes,
  distributeNodes
} from '@whiteboard/core/node/layout'
import {
  buildMoveCommit,
  buildMoveSet,
  projectMovePreview,
  projectMovePositions,
  resolveMoveEffect
} from '@whiteboard/core/node/move'
import {
  finishMoveState,
  startMoveState,
  stepMoveState
} from '@whiteboard/core/node/moveState'
import {
  containsPointInNodeOutline,
  distanceToNodeOutline,
  getAutoNodeAnchor,
  getNodeAnchor,
  getNodeBounds,
  getNodeGeometry,
  getNodeOutline,
  projectNodeAnchor,
  projectPointToNodeOutline
} from '@whiteboard/core/node/outline'
import {
  applyNodeGeometryPatch,
  applyNodeTextDraft,
  applyNodeTextPreview,
  isNodeProjectionPatchEqual,
  toSpatialNode
} from '@whiteboard/core/node/projection'
import { applySelection } from '@whiteboard/core/node/selection'
import {
  isShapeKind,
  readShapeDescriptor,
  readShapeKind,
  SHAPE_DESCRIPTORS
} from '@whiteboard/core/node/shape'
import {
  buildSnapCandidates,
  computeResizeSnap,
  computeSnap,
  createGridIndex,
  queryGridIndex
} from '@whiteboard/core/node/snap'
import {
  buildTextLayoutKey,
  estimateTextAutoFont,
  isTextContentEmpty,
  isTextNode,
  readStickyFontMode,
  readTextComputedSize,
  readTextFrameInsets,
  readTextLayoutInput,
  readTextWidthMode,
  readTextWrapWidth,
  resolveTextAutoFont,
  resolveTextBox,
  resolveTextContentBox,
  resolveTextFrameMetrics,
  resolveTextHandle,
  setStickyFontMode,
  setTextWidthMode,
  setTextWrapWidth,
  shouldPatchTextLayout,
  TEXT_AUTO_MAX_WIDTH,
  TEXT_AUTO_MIN_WIDTH,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_FIT_VERTICAL_MARGIN,
  TEXT_LAYOUT_MIN_WIDTH,
  TEXT_RESIZE_HANDLES
} from '@whiteboard/core/node/text'
import {
  buildSelectionTransformPlan,
  buildTransformCommitUpdates,
  buildTransformHandles,
  computeNextRotation,
  computeResizeRect,
  finishTransform,
  getResizeSourceEdges,
  getResizeUpdateRect,
  isCornerResizeDirection,
  projectResizePatches,
  projectResizeTransformPatches,
  projectRotateTransformPatches,
  projectSelectionTransform,
  projectTextScale,
  resizeHandleMap,
  resolveAnchoredRect,
  resolveNodeTransformBehavior,
  resolveResizeRectFromSize,
  resolveSelectionTransformFamily,
  rotateVector,
  startTransform,
  stepTransform,
  toTransformCommitPatch
} from '@whiteboard/core/node/transform'
import {
  applyNodeUpdate,
  buildNodeUpdateInverse,
  classifyNodeUpdate,
  createNodeFieldsUpdateOperation,
  createNodeUpdateOperation,
  isNodeUpdateEmpty
} from '@whiteboard/core/node/update'
import {
  expandRectByThreshold,
  resolveInteractionZoom,
  resolveSnapThresholdWorld
} from '@whiteboard/core/snap'

export const node = {
  update: {
    apply: applyNodeUpdate,
    inverse: buildNodeUpdateInverse,
    classify: classifyNodeUpdate,
    createFieldsOperation: createNodeFieldsUpdateOperation,
    createOperation: createNodeUpdateOperation,
    isEmpty: isNodeUpdateEmpty
  },
  geometry: {
    aabb: getNodeAABB,
    boundsByNode: getNodeBoundsByNode,
    rotation: readNodeRotation,
    rect: getNodeRect,
    bounds: getNodesBounds
  },
  outline: {
    containsPoint: containsPointInNodeOutline,
    distanceToOutline: distanceToNodeOutline,
    autoAnchor: getAutoNodeAnchor,
    anchor: getNodeAnchor,
    bounds: getNodeBounds,
    geometry: getNodeGeometry,
    outline: getNodeOutline,
    projectPoint: projectPointToNodeOutline,
    projectAnchor: projectNodeAnchor
  },
  draw: {
    matchRect: matchDrawRect,
    baseSize: readDrawBaseSize,
    points: readDrawPoints,
    resolvePoints: resolveDrawPoints,
    resolveStroke: resolveDrawStroke
  },
  group: {
    boundingRect: getNodesBoundingRect,
    rectEquals
  },
  frame: {
    create: createFrameQuery,
    at: frameAt,
    parent: frameParent,
    children: frameChildren,
    descendants: frameDescendants,
    pick: pickFrame,
    pickParent: pickFrameParent
  },
  move: {
    buildCommit: buildMoveCommit,
    buildSet: buildMoveSet,
    projectPreview: projectMovePreview,
    projectPositions: projectMovePositions,
    resolveEffect: resolveMoveEffect,
    state: {
      start: startMoveState,
      step: stepMoveState,
      finish: finishMoveState
    }
  },
  transform: {
    buildCommitUpdates: buildTransformCommitUpdates,
    buildPlan: buildSelectionTransformPlan,
    buildHandles: buildTransformHandles,
    nextRotation: computeNextRotation,
    resizeRect: computeResizeRect,
    project: projectSelectionTransform,
    projectTextScale,
    finish: finishTransform,
    resizeUpdateRect: getResizeUpdateRect,
    isCornerResizeDirection,
    projectResizePatches,
    projectResizeTransformPatches,
    projectRotateTransformPatches,
    anchoredRect: resolveAnchoredRect,
    resolveBehavior: resolveNodeTransformBehavior,
    resizeRectFromSize: resolveResizeRectFromSize,
    selectionFamily: resolveSelectionTransformFamily,
    start: startTransform,
    step: stepTransform,
    resizeSourceEdges: getResizeSourceEdges,
    resizeHandleMap,
    toCommitPatch: toTransformCommitPatch,
    rotateVector
  },
  snap: {
    buildCandidates: buildSnapCandidates,
    compute: computeSnap,
    computeResize: computeResizeSnap,
    expandRectByThreshold,
    interactionZoom: resolveInteractionZoom,
    thresholdWorld: resolveSnapThresholdWorld,
    grid: {
      create: createGridIndex,
      query: queryGridIndex
    }
  },
  hit: {
    filterIdsInRect: filterNodeIdsInRect,
    idsInRect: getNodeIdsInRect,
    matchRect: matchCanvasNodeRect
  },
  op: {
    create: createNodeOp,
    align: planNodeAlignOps,
    distribute: planNodeDistributeOps
  },
  layout: {
    align: alignNodes,
    distribute: distributeNodes
  },
  projection: {
    applyGeometryPatch: applyNodeGeometryPatch,
    applyTextDraft: applyNodeTextDraft,
    applyTextPreview: applyNodeTextPreview,
    equalPatch: isNodeProjectionPatchEqual,
    toSpatial: toSpatialNode
  },
  text: {
    buildLayoutKey: buildTextLayoutKey,
    estimateAutoFont: estimateTextAutoFont,
    isContentEmpty: isTextContentEmpty,
    isTextNode,
    computedSize: readTextComputedSize,
    stickyFontMode: readStickyFontMode,
    frameInsets: readTextFrameInsets,
    layoutInput: readTextLayoutInput,
    wrapWidth: readTextWrapWidth,
    widthMode: readTextWidthMode,
    frameMetrics: resolveTextFrameMetrics,
    handle: resolveTextHandle,
    setStickyFontMode,
    setWrapWidth: setTextWrapWidth,
    setWidthMode: setTextWidthMode,
    shouldPatchLayout: shouldPatchTextLayout,
    autoMaxWidth: TEXT_AUTO_MAX_WIDTH,
    autoMinWidth: TEXT_AUTO_MIN_WIDTH,
    fitVerticalMargin: TEXT_FIT_VERTICAL_MARGIN,
    layoutMinWidth: TEXT_LAYOUT_MIN_WIDTH,
    resizeHandles: TEXT_RESIZE_HANDLES,
    resolveAutoFont: resolveTextAutoFont,
    box: resolveTextBox,
    contentBox: resolveTextContentBox,
    defaultFontSize: TEXT_DEFAULT_FONT_SIZE
  },
  selection: {
    apply: applySelection
  },
  shape: {
    descriptors: SHAPE_DESCRIPTORS,
    isKind: isShapeKind,
    descriptor: readShapeDescriptor,
    kind: readShapeKind
  },
  bootstrap: {
    textSize: TEXT_BOOTSTRAP_SIZE,
    resolve: resolveNodeBootstrapSize,
    resolveText: resolveTextNodeBootstrapSize
  }
} as const

export {
  toSpatialNode
} from '@whiteboard/core/node/projection'

export type { NodeOutlineAnchorOptions } from '@whiteboard/core/node/outline'
export type { ResolvedDrawStroke } from '@whiteboard/core/node/draw'
export type { NodeRectHitOptions } from '@whiteboard/core/node/hitTest'
export type {
  MoveCommit,
  MoveEdgePlan,
  MoveEdgeChange,
  MoveEffect,
  MoveMember,
  MoveNodePosition,
  MoveSet
} from '@whiteboard/core/node/move'
export type {
  MoveState,
  MoveSnapResolver,
  MoveStepResult
} from '@whiteboard/core/node/moveState'
export type {
  ResizeGestureInput,
  ResizeGestureSnapshot,
  ResizeUpdate,
  ResizeRectFromSizeInput,
  ResizeDirection,
  RotateGestureInput,
  RotateGestureSnapshot,
  TextScaleProjection,
  TransformCommit,
  TransformCommitUpdate,
  TransformDraft,
  TransformOperationFamily,
  TransformModifiers,
  SelectionTransformHandlePlan,
  SelectionTransformMember,
  SelectionTransformPlan,
  TransformSelectionMember,
  TransformResizeSnapInput,
  TransformResizeSnapResolver,
  TransformResizeSnapResult,
  TransformPreviewPatch,
  TransformProjectionMember,
  AnchoredRectInput,
  NodeTransformBehavior,
  TransformSpec,
  TransformState,
  TransformStepInput,
  TransformStepResult,
  TransformHandle
} from '@whiteboard/core/node/transform'
export type {
  HorizontalResizeEdge,
  VerticalResizeEdge
} from '@whiteboard/core/node/resize'
export type {
  StickyFontMode,
  TextAutoFont,
  TextContentBox,
  TextFrameInsets,
  TextLayoutInput,
  TextFrameMetrics,
  TextHandleMode,
  TextVariant,
  TextWidthMode
} from '@whiteboard/core/node/text'
export type { ShapeKind } from '@whiteboard/core/node/shape'
export type {
  ShapeDescriptor,
  ShapeLabelInset,
  ShapeOutlineSide,
  ShapeOutlineSpec,
  ShapePathSpec,
  ShapeVisualSpec
} from '@whiteboard/core/node/shape'
export type {
  NodeAlignMode,
  NodeDistributeMode,
  NodeLayoutEntry,
  NodeLayoutUpdate
} from '@whiteboard/core/node/layout'
export type {
  GridIndex,
  Guide,
  SnapAxis,
  SnapCandidate,
  SnapEdge,
  SnapResult
} from '@whiteboard/core/node/snap'
export type { SnapThresholdConfig } from '@whiteboard/core/snap'
export type { SelectionMode } from '@whiteboard/core/node/selection'
