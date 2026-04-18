export {
  applyNodeUpdate,
  buildNodeUpdateInverse,
  classifyNodeUpdate,
  createNodeFieldsUpdateOperation,
  createNodeUpdateOperation,
  isNodeUpdateEmpty
} from '@whiteboard/core/node/update'
export {
  getNodeAABB,
  getNodeBoundsByNode,
  readNodeRotation,
  getNodeRect,
  getNodesBounds
} from '@whiteboard/core/node/geometry'
export {
  containsPointInNodeOutline,
  distanceToNodeOutline,
  getAutoNodeAnchor,
  getNodeAnchor,
  getNodeBounds,
  getNodeGeometry,
  getNodeOutline,
  projectPointToNodeOutline,
  projectNodeAnchor,
  type NodeOutlineAnchorOptions
} from '@whiteboard/core/node/outline'
export {
  matchDrawRect,
  readDrawBaseSize,
  readDrawPoints,
  resolveDrawPoints,
  resolveDrawStroke,
  type ResolvedDrawStroke
} from '@whiteboard/core/node/draw'
export {
  getNodesBoundingRect,
  rectEquals
} from '@whiteboard/core/node/group'
export {
  collectFrameMembers,
  expandFrameSelection,
  resolveFrameAtPoint,
  resolveNodeFrame
} from '@whiteboard/core/node/frame'
export {
  buildMoveCommit,
  buildMoveSet,
  projectMovePreview,
  projectMovePositions,
  resolveMoveEffect
} from '@whiteboard/core/node/move'
export type {
  MoveCommit,
  MoveEdgePlan,
  MoveEdgeChange,
  MoveEffect,
  MoveMember,
  MoveNodePosition,
  MoveSet
} from '@whiteboard/core/node/move'
export {
  finishMoveState,
  startMoveState,
  stepMoveState
} from '@whiteboard/core/node/moveState'
export type {
  MoveState,
  MoveSnapResolver,
  MoveStepResult
} from '@whiteboard/core/node/moveState'
export {
  buildTransformCommitUpdates,
  buildSelectionTransformPlan,
  buildTransformHandles,
  computeNextRotation,
  computeResizeRect,
  projectSelectionTransform,
  projectTextScale,
  finishTransform,
  getResizeUpdateRect,
  isCornerResizeDirection,
  projectResizePatches,
  projectResizeTransformPatches,
  projectRotateTransformPatches,
  resolveAnchoredRect,
  resolveNodeTransformBehavior,
  resolveResizeRectFromSize,
  resolveSelectionTransformFamily,
  startTransform,
  stepTransform,
  getResizeSourceEdges,
  resizeHandleMap,
  toTransformCommitPatch,
  rotateVector
} from '@whiteboard/core/node/transform'
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
export {
  buildSnapCandidates,
  computeResizeSnap,
  computeSnap,
  createGridIndex,
  queryGridIndex
} from '@whiteboard/core/node/snap'
export {
  expandRectByThreshold,
  resolveInteractionZoom,
  resolveSnapThresholdWorld
} from '@whiteboard/core/snap'
export {
  filterNodeIdsInRect,
  getNodeIdsInRect,
  matchCanvasNodeRect,
  type NodeRectMatchEntry,
  type NodeRectHitEntry,
  type NodeRectHitMatch,
  type NodeRectHitPolicy,
  type NodeRectQuery,
  type NodeRectHitOptions
} from '@whiteboard/core/node/hitTest'
export { toLayerOrderedCanvasNodes, toLayerOrderedCanvasNodeIds } from '@whiteboard/core/node/layer'
export {
  buildNodeCreateOperation,
  buildNodeAlignOperations,
  buildNodeDistributeOperations
} from '@whiteboard/core/node/commands'
export {
  alignNodes,
  distributeNodes
} from '@whiteboard/core/node/layout'
export {
  applyNodeGeometryPatch,
  applyNodeTextDraft,
  applyNodeTextPreview,
  isNodeProjectionPatchEqual
} from '@whiteboard/core/node/projection'
export {
  buildTextLayoutKey,
  estimateTextAutoFont,
  isTextContentEmpty,
  isTextNode,
  readTextComputedSize,
  readStickyFontMode,
  readTextFrameInsets,
  readTextLayoutInput,
  readTextWrapWidth,
  readTextWidthMode,
  resolveTextFrameMetrics,
  resolveTextHandle,
  setStickyFontMode,
  setTextWrapWidth,
  setTextWidthMode,
  shouldPatchTextLayout,
  TEXT_AUTO_MAX_WIDTH,
  TEXT_AUTO_MIN_WIDTH,
  TEXT_FIT_VERTICAL_MARGIN,
  TEXT_LAYOUT_MIN_WIDTH,
  TEXT_RESIZE_HANDLES,
  resolveTextAutoFont,
  resolveTextBox,
  resolveTextContentBox,
  TEXT_DEFAULT_FONT_SIZE
} from '@whiteboard/core/node/text'
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
export {
  applySelection
} from '@whiteboard/core/node/selection'
export {
  SHAPE_DESCRIPTORS,
  SHAPE_MENU_SECTIONS,
  SHAPE_SPECS,
  createShapeNodeInput,
  isShapeKind,
  readShapeDescriptor,
  readShapeKind,
  readShapeMeta,
  readShapePreviewFill,
  readShapeSpec,
  type ShapeKind
} from '@whiteboard/core/node/shape'
export type {
  ShapeControlId,
  ShapeDescriptor,
  ShapeGroup,
  ShapeLabelInset,
  ShapeMenuSection,
  ShapeMeta,
  ShapeOutlineSide,
  ShapeOutlineSpec,
  ShapePathSpec,
  ShapeSpec,
  ShapeVisualSpec
} from '@whiteboard/core/node/shape'
export {
  TEXT_BOOTSTRAP_SIZE,
  resolveNodeBootstrapSize,
  resolveTextNodeBootstrapSize
} from '@whiteboard/core/node/bootstrap'
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
export type {
  SnapThresholdConfig
} from '@whiteboard/core/snap'
export type {
  SelectionMode
} from '@whiteboard/core/node/selection'
