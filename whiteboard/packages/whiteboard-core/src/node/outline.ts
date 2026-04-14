import type {
  EdgeAnchor,
  Node,
  NodeGeometry,
  NodeOutline,
  Point,
  Rect
} from '@whiteboard/core/types'
import {
  clamp,
  getAnchorPoint,
  getAABBFromPoints,
  getRectCenter,
  getRotatedCorners,
  rotatePoint
} from '@whiteboard/core/geometry'
import {
  readShapeDescriptor,
  readShapeKind,
  type ShapeOutlineSpec
} from '@whiteboard/core/node/shape'

type OutlineSide = EdgeAnchor['side']

type OutlineSpec = ShapeOutlineSpec

export type NodeOutlineAnchorOptions = {
  snapMin: number
  snapRatio: number
  anchorOffset?: number
}

type Projection = {
  side: OutlineSide
  distance: number
  point: Point
  offset: number
  centerDistance: number
}

const DEFAULT_ANCHOR_OFFSET = 0.5
const point = (x: number, y: number): Point => ({ x, y })
const FULL_RECT_OUTLINE: OutlineSpec = {
  top: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  right: [{ x: 1, y: 0 }, { x: 1, y: 1 }],
  bottom: [{ x: 0, y: 1 }, { x: 1, y: 1 }],
  left: [{ x: 0, y: 0 }, { x: 0, y: 1 }]
}

const getOutlineSpec = (
  node: Pick<Node, 'type' | 'data'>
): OutlineSpec => {
  if (node.type !== 'shape') {
    return FULL_RECT_OUTLINE
  }

  return readShapeDescriptor(readShapeKind(node)).outline
}

const toLocalPoint = (
  rect: Rect,
  value: Point
): Point => ({
  x: rect.x + rect.width * value.x,
  y: rect.y + rect.height * value.y
})

const toSidePoints = (
  rect: Rect,
  node: Pick<Node, 'type' | 'data'>,
  side: OutlineSide
): Point[] => getOutlineSpec(node)[side].map((value) => toLocalPoint(rect, value))

const readOutlinePoints = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect
) => {
  const sides: OutlineSide[] = ['top', 'right', 'bottom', 'left']
  return sides.flatMap((side) => toSidePoints(rect, node, side))
}

const distance = (
  left: Point,
  right: Point
) => Math.hypot(left.x - right.x, left.y - right.y)

const samplePolyline = (
  points: readonly Point[],
  offset: number
): Point => {
  if (points.length <= 1) {
    return points[0] ?? point(0, 0)
  }

  const clamped = clamp(offset, 0, 1)
  let total = 0
  const lengths: number[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index], points[index + 1])
    lengths.push(length)
    total += length
  }

  if (total <= 0) {
    return points[0]
  }

  const target = total * clamped
  let walked = 0

  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]
    if (walked + length < target) {
      walked += length
      continue
    }

    const progress = length <= 0 ? 0 : (target - walked) / length
    const from = points[index]
    const to = points[index + 1]
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress
    }
  }

  return points[points.length - 1]
}

const projectPointToSegment = (
  source: Point,
  from: Point,
  to: Point
) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSq = dx * dx + dy * dy
  const rawT = lengthSq <= 0
    ? 0
    : ((source.x - from.x) * dx + (source.y - from.y) * dy) / lengthSq
  const t = clamp(rawT, 0, 1)

  return {
    t,
    point: {
      x: from.x + dx * t,
      y: from.y + dy * t
    }
  }
}

const projectToPolyline = (
  source: Point,
  side: OutlineSide,
  points: readonly Point[]
): Projection => {
  if (points.length <= 1) {
    const single = points[0] ?? point(0, 0)
    return {
      side,
      distance: distance(source, single),
      point: single,
      offset: DEFAULT_ANCHOR_OFFSET,
      centerDistance: distance(source, single)
    }
  }

  let total = 0
  const lengths: number[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index], points[index + 1])
    lengths.push(length)
    total += length
  }

  let best: Projection | undefined
  let walked = 0

  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]
    const projection = projectPointToSegment(source, points[index], points[index + 1])
    const nextDistance = distance(source, projection.point)
    const nextOffset = total <= 0
      ? DEFAULT_ANCHOR_OFFSET
      : (walked + length * projection.t) / total

    if (!best || nextDistance < best.distance) {
      best = {
        side,
        distance: nextDistance,
        point: projection.point,
        offset: nextOffset,
        centerDistance: distance(source, samplePolyline(points, DEFAULT_ANCHOR_OFFSET))
      }
    }

    walked += length
  }

  return best ?? {
    side,
    distance: Number.POSITIVE_INFINITY,
    point: points[0],
    offset: DEFAULT_ANCHOR_OFFSET,
    centerDistance: Number.POSITIVE_INFINITY
  }
}

const projectToOutline = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect,
  pointValue: Point
): Projection => {
  const sides: OutlineSide[] = ['top', 'right', 'bottom', 'left']
  let best = projectToPolyline(pointValue, 'top', toSidePoints(rect, node, 'top'))

  for (let index = 1; index < sides.length; index += 1) {
    const side = sides[index]
    const next = projectToPolyline(pointValue, side, toSidePoints(rect, node, side))
    if (next.distance < best.distance) {
      best = next
    }
  }

  return best
}

const isPointOnSegment = (
  pointValue: Point,
  from: Point,
  to: Point,
  epsilon = 0.0001
) => {
  const cross = (pointValue.y - from.y) * (to.x - from.x)
    - (pointValue.x - from.x) * (to.y - from.y)
  if (Math.abs(cross) > epsilon) {
    return false
  }

  const dot = (pointValue.x - from.x) * (to.x - from.x)
    + (pointValue.y - from.y) * (to.y - from.y)
  if (dot < -epsilon) {
    return false
  }

  const lengthSq = (to.x - from.x) * (to.x - from.x)
    + (to.y - from.y) * (to.y - from.y)

  return dot <= lengthSq + epsilon
}

const isPointInPolygon = (
  pointValue: Point,
  points: readonly Point[]
) => {
  if (points.length < 3) {
    return false
  }

  let inside = false

  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index]!
    const prior = points[previous]!

    if (isPointOnSegment(pointValue, prior, current)) {
      return true
    }

    const intersects = (
      (current.y > pointValue.y) !== (prior.y > pointValue.y)
      && pointValue.x < ((prior.x - current.x) * (pointValue.y - current.y)) / ((prior.y - current.y) || 1) + current.x
    )
    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

const toWorldPoint = (
  pointValue: Point,
  center: Point,
  rotation: number
) => rotation
  ? rotatePoint(pointValue, center, rotation)
  : pointValue

const resolveAutoSide = (
  center: Point,
  otherPoint: Point
): OutlineSide => {
  const dx = otherPoint.x - center.x
  const dy = otherPoint.y - center.y

  return Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? 'right' : 'left')
    : dy >= 0
      ? 'bottom'
      : 'top'
}

const getNodeAnchorPoint = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect,
  anchor?: EdgeAnchor,
  rotation = 0,
  defaultOffset = DEFAULT_ANCHOR_OFFSET
): Point => {
  if (!anchor) {
    return getRectCenter(rect)
  }

  const center = getRectCenter(rect)
  const local = samplePolyline(
    toSidePoints(rect, node, anchor.side),
    Number.isFinite(anchor.offset)
      ? anchor.offset
      : defaultOffset
  )

  return toWorldPoint(local, center, rotation)
}

const getNodeShapeBounds = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect,
  rotation = 0
): Rect => {
  if (node.type !== 'shape') {
    return rect
  }

  const center = getRectCenter(rect)
  const points = readOutlinePoints(node, rect).map((point) => (
    rotation
      ? rotatePoint(point, center, rotation)
      : point
  ))

  return getAABBFromPoints(points)
}

export const getNodeBounds = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect,
  rotation = 0
): Rect => (
  node.type === 'shape'
    ? getNodeShapeBounds(node, rect, rotation)
    : (
        rotation === 0
          ? rect
          : getAABBFromPoints(getRotatedCorners(rect, rotation))
      )
)

export const getNodeOutline = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect,
  rotation = 0
): NodeOutline => {
  if (node.type !== 'shape') {
    return {
      kind: 'rect',
      rect,
      rotation
    }
  }

  const center = getRectCenter(rect)

  return {
    kind: 'polygon',
    points: readOutlinePoints(node, rect).map((point) => (
      rotation
        ? rotatePoint(point, center, rotation)
        : point
    ))
  }
}

export const containsPointInNodeOutline = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect,
  rotation: number,
  pointValue: Point
) => {
  const outline = getNodeOutline(node, rect, rotation)

  if (outline.kind === 'rect') {
    return isPointInPolygon(pointValue, getRotatedCorners(outline.rect, outline.rotation))
  }

  return isPointInPolygon(pointValue, outline.points)
}

export const getNodeGeometry = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect,
  rotation = 0
): NodeGeometry => {
  const outline = getNodeOutline(node, rect, rotation)

  return {
    rect,
    outline,
    bounds: getNodeBounds(node, rect, rotation)
  }
}

export const getNodeAnchor = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect,
  anchor?: EdgeAnchor,
  rotation = 0,
  defaultOffset = DEFAULT_ANCHOR_OFFSET
): Point => (
  node.type === 'shape'
    ? getNodeAnchorPoint(node, rect, anchor, rotation, defaultOffset)
    : getAnchorPoint(rect, anchor, rotation, defaultOffset)
)

export const projectPointToNodeOutline = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect,
  rotation: number,
  pointValue: Point,
  defaultOffset = DEFAULT_ANCHOR_OFFSET
) => {
  const center = getRectCenter(rect)
  const localPoint = rotation
    ? rotatePoint(pointValue, center, -rotation)
    : pointValue
  const projected = projectToOutline(node, rect, localPoint)
  const anchor: EdgeAnchor = {
    side: projected.side,
    offset: projected.offset
  }
  const point = getNodeAnchor(node, rect, anchor, rotation, defaultOffset)

  return {
    point,
    anchor,
    distance: distance(pointValue, point)
  }
}

export const distanceToNodeOutline = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect,
  rotation: number,
  pointValue: Point
) => projectPointToNodeOutline(node, rect, rotation, pointValue).distance

export const projectNodeAnchor = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect,
  rotation: number,
  pointValue: Point,
  options: NodeOutlineAnchorOptions
) => {
  const center = getRectCenter(rect)
  const localPoint = rotation
    ? rotatePoint(pointValue, center, -rotation)
    : pointValue
  const projected = projectToOutline(node, rect, localPoint)
  const threshold = Math.max(
    options.snapMin,
    Math.min(rect.width, rect.height) * options.snapRatio
  )
  const anchorOffset = options.anchorOffset ?? DEFAULT_ANCHOR_OFFSET
  const offset = projected.centerDistance <= threshold
    ? anchorOffset
    : projected.offset
  const anchor: EdgeAnchor = {
    side: projected.side,
    offset
  }

  return {
    anchor,
    point: getNodeAnchor(node, rect, anchor, rotation, anchorOffset)
  }
}

export const getAutoNodeAnchor = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect,
  rotation: number,
  otherPoint: Point,
  options?: {
    anchorOffset?: number
  }
) => {
  const center = getRectCenter(rect)
  if (center.x === otherPoint.x && center.y === otherPoint.y) {
    const anchor: EdgeAnchor = {
      side: resolveAutoSide(center, otherPoint),
      offset: options?.anchorOffset ?? DEFAULT_ANCHOR_OFFSET
    }

    return {
      anchor,
      point: getNodeAnchor(node, rect, anchor, rotation, anchor.offset)
    }
  }

  return projectNodeAnchor(
    node,
    rect,
    rotation,
    otherPoint,
    {
      snapMin: 0,
      snapRatio: 0,
      anchorOffset: options?.anchorOffset ?? DEFAULT_ANCHOR_OFFSET
    }
  )
}
