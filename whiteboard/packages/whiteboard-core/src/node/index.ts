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
  createWhiteboardPaletteKey,
  isWhiteboardPaletteKey,
  parseWhiteboardPaletteKey,
  resolveWhiteboardPaletteValue,
  resolveWhiteboardPaletteVariable,
  WHITEBOARD_BG_PALETTE_INDICES,
  WHITEBOARD_BORDER_PALETTE_INDICES,
  WHITEBOARD_DRAW_DEFAULTS,
  WHITEBOARD_FRAME_DEFAULTS,
  WHITEBOARD_LINE_DEFAULT_COLOR,
  WHITEBOARD_LINE_PALETTE_INDICES,
  WHITEBOARD_PALETTE_KEYS,
  WHITEBOARD_PALETTE_REGISTRY,
  WHITEBOARD_SHAPE_DEFAULTS,
  WHITEBOARD_SHAPE_PRESET_PAINTS,
  WHITEBOARD_STICKY_PALETTE_INDICES,
  WHITEBOARD_STICKY_DEFAULTS,
  WHITEBOARD_STICKY_TONE_PRESETS,
  WHITEBOARD_STROKE_DEFAULT_COLOR,
  WHITEBOARD_SURFACE_DEFAULT_FILL,
  WHITEBOARD_TEXT_DEFAULT_COLOR,
  WHITEBOARD_TEXT_PALETTE_INDICES,
  type WhiteboardPaletteGroup,
  type WhiteboardPaletteKey,
  type WhiteboardPaletteRegistry,
  type WhiteboardPaintPreset,
  type WhiteboardStickyTonePreset
} from '@whiteboard/core/palette'
export {
  FRAME_DEFAULT_FILL,
  FRAME_DEFAULT_STROKE,
  FRAME_DEFAULT_STROKE_WIDTH,
  FRAME_DEFAULT_TEXT_COLOR,
  FRAME_DEFAULT_TITLE,
  FRAME_START_SIZE,
  STICKY_DEFAULT_FILL,
  STICKY_RECTANGLE_SIZE,
  STICKY_DEFAULT_STROKE,
  STICKY_DEFAULT_STROKE_WIDTH,
  STICKY_SQUARE_SIZE,
  STICKY_DEFAULT_TEXT_COLOR,
  STICKY_PLACEHOLDER,
  STICKY_START_SIZE,
  TEXT_PLACEHOLDER,
  TEXT_START_SIZE,
  resolveNodeBootstrapSize,
  resolveTextNodeBootstrapSize,
  createFrameNodeInput,
  createStickyNodeInput,
  createTextNodeInput
} from '@whiteboard/core/node/templates'
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
