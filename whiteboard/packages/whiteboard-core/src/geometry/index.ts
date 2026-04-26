import { getAnchorPoint } from '@whiteboard/core/geometry/anchor'
import {
  rectContainsRotatedRect,
  rectIntersectsRotatedRect
} from '@whiteboard/core/geometry/collision'
import {
  isPointEqual,
  isSizeEqual
} from '@whiteboard/core/geometry/equality'
import {
  rotatePoint,
  quantizePointToAngleStep,
  quantizePointToOctilinear
} from '@whiteboard/core/geometry/point'
import {
  arePointListsEqual,
  normalizePolylinePoints
} from '@whiteboard/core/geometry/polyline'
import {
  expandRect,
  getAABBFromPoints,
  getRectCenter,
  getRectCorners,
  getRectsBoundingRect,
  isPointInRect,
  rectContains,
  rectFromPoints,
  rectIntersects
} from '@whiteboard/core/geometry/rect'
import {
  getRotatedCorners,
  isPointInRotatedRect
} from '@whiteboard/core/geometry/rotation'
import { clamp, degToRad } from '@whiteboard/core/geometry/scalar'
import {
  distancePointToSegment,
  getSegmentBounds
} from '@whiteboard/core/geometry/segment'
import {
  DEFAULT_VIEWPORT_FIT_PADDING,
  DEFAULT_VIEWPORT_LIMITS,
  EMPTY_CONTAINER_RECT,
  applyScreenPan,
  applyWheelInput,
  clientToScreenPoint,
  copyViewport,
  fitViewportToRect,
  isSameViewport,
  normalizeViewport,
  normalizeViewportLimits,
  panViewport,
  projectPoint,
  projectRect,
  screenToWorldPoint,
  viewportScreenToWorld,
  viewportWorldToScreen,
  worldToScreenPoint,
  zoomViewport
} from '@whiteboard/core/geometry/viewport'

export const geometry = {
  scalar: {
    clamp,
    degToRad
  },
  rect: {
    center: getRectCenter,
    containsPoint: isPointInRect,
    fromPoints: rectFromPoints,
    contains: rectContains,
    intersects: rectIntersects,
    expand: expandRect,
    corners: getRectCorners,
    aabbFromPoints: getAABBFromPoints,
    boundingRect: getRectsBoundingRect
  },
  point: {
    rotate: rotatePoint,
    quantizeAngleStep: quantizePointToAngleStep,
    quantizeOctilinear: quantizePointToOctilinear
  },
  anchor: {
    point: getAnchorPoint
  },
  polyline: {
    normalize: normalizePolylinePoints,
    equal: arePointListsEqual
  },
  rotation: {
    corners: getRotatedCorners,
    containsPoint: isPointInRotatedRect
  },
  collision: {
    rectIntersectsRotatedRect,
    rectContainsRotatedRect
  },
  segment: {
    distanceToPoint: distancePointToSegment,
    bounds: getSegmentBounds
  },
  equal: {
    point: isPointEqual,
    size: isSizeEqual
  },
  viewport: {
    fitPadding: DEFAULT_VIEWPORT_FIT_PADDING,
    defaultLimits: DEFAULT_VIEWPORT_LIMITS,
    emptyContainerRect: EMPTY_CONTAINER_RECT,
    applyScreenPan,
    applyWheelInput,
    clientToScreenPoint,
    copy: copyViewport,
    fitToRect: fitViewportToRect,
    normalize: normalizeViewport,
    normalizeLimits: normalizeViewportLimits,
    pan: panViewport,
    projectPoint,
    projectRect,
    screenToWorld: screenToWorldPoint,
    zoom: zoomViewport,
    worldToScreen: worldToScreenPoint,
    viewportScreenToWorld,
    viewportWorldToScreen,
    isSame: isSameViewport
  }
} as const

export type {
  ContainerRect,
  ViewportLimits,
  WheelInput
} from '@whiteboard/core/geometry/viewport'
