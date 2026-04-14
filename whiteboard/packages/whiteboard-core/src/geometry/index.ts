export { clamp, degToRad } from '@whiteboard/core/geometry/scalar'

export {
  getRectCenter,
  isPointInRect,
  rectFromPoints,
  rectContains,
  rectIntersects,
  expandRect,
  getRectCorners,
  getAABBFromPoints,
  getRectsBoundingRect
} from '@whiteboard/core/geometry/rect'

export { rotatePoint } from '@whiteboard/core/geometry/point'
export { getAnchorPoint } from '@whiteboard/core/geometry/anchor'
export {
  normalizePolylinePoints,
  arePointListsEqual
} from '@whiteboard/core/geometry/polyline'

export {
  getRotatedCorners,
  isPointInRotatedRect
} from '@whiteboard/core/geometry/rotation'

export {
  rectIntersectsRotatedRect,
  rectContainsRotatedRect
} from '@whiteboard/core/geometry/collision'

export {
  distancePointToSegment,
  getSegmentBounds
} from '@whiteboard/core/geometry/segment'

export {
  isPointEqual,
  isSizeEqual
} from '@whiteboard/core/geometry/equality'

export {
  DEFAULT_VIEWPORT_FIT_PADDING,
  DEFAULT_VIEWPORT_LIMITS,
  EMPTY_CONTAINER_RECT,
  applyScreenPan,
  applyWheelInput,
  clientToScreenPoint,
  copyViewport,
  fitViewportToRect,
  viewportScreenToWorld,
  viewportWorldToScreen,
  normalizeViewport,
  normalizeViewportLimits,
  panViewport,
  screenToWorldPoint,
  zoomViewport,
  worldToScreenPoint,
  isSameViewport
} from '@whiteboard/core/geometry/viewport'
export type {
  ContainerRect,
  ViewportLimits,
  WheelInput
} from '@whiteboard/core/geometry/viewport'
