import type { EdgeAnchor, Node, Point, Rect } from '../types'
import {
  clamp,
  expandRect,
  getAABBFromPoints,
  getRectCenter,
  rotatePoint
} from '../geometry'
import { readShapeKind, type ShapeKind } from './shape'

type OutlineSide = EdgeAnchor['side']

type OutlineSpec = Record<OutlineSide, readonly Point[]>

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
const OUTLINE_VIEWBOX = 100
const CURVE_SEGMENTS = 12

const point = (x: number, y: number): Point => ({ x, y })

const point100 = (
  x: number,
  y: number
): Point => point(x / OUTLINE_VIEWBOX, y / OUTLINE_VIEWBOX)

const polyline100 = (
  ...values: ReadonlyArray<readonly [number, number]>
): Point[] => values.map(([x, y]) => point100(x, y))

const joinPolyline = (
  ...segments: ReadonlyArray<readonly Point[]>
): Point[] => {
  const joined: Point[] = []

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    for (let pointIndex = 0; pointIndex < segment.length; pointIndex += 1) {
      const next = segment[pointIndex]
      const last = joined[joined.length - 1]
      if (last && last.x === next.x && last.y === next.y) {
        continue
      }
      joined.push(next)
    }
  }

  return joined
}

const createEllipseArc = (
  startDeg: number,
  endDeg: number,
  options: {
    centerX: number
    centerY: number
    radiusX: number
    radiusY: number
    segments?: number
  }
): Point[] => {
  const {
    centerX,
    centerY,
    radiusX,
    radiusY,
    segments = CURVE_SEGMENTS
  } = options
  const points: Point[] = []

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments
    const degrees = startDeg + (endDeg - startDeg) * progress
    const radians = degrees * (Math.PI / 180)
    points.push(
      point100(
        centerX + Math.cos(radians) * radiusX,
        centerY + Math.sin(radians) * radiusY
      )
    )
  }

  return points
}

const createCubicCurve = (
  start: readonly [number, number],
  control1: readonly [number, number],
  control2: readonly [number, number],
  end: readonly [number, number],
  segments = CURVE_SEGMENTS
): Point[] => {
  const points: Point[] = []

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments
    const inverse = 1 - t
    const x =
      start[0] * inverse * inverse * inverse +
      3 * control1[0] * inverse * inverse * t +
      3 * control2[0] * inverse * t * t +
      end[0] * t * t * t
    const y =
      start[1] * inverse * inverse * inverse +
      3 * control1[1] * inverse * inverse * t +
      3 * control2[1] * inverse * t * t +
      end[1] * t * t * t

    points.push(point100(x, y))
  }

  return points
}

const createRoundedRectOutline = (options: {
  left: number
  top: number
  right: number
  bottom: number
  radiusX: number
  radiusY: number
}): OutlineSpec => {
  const {
    left,
    top,
    right,
    bottom,
    radiusX,
    radiusY
  } = options

  if (radiusX <= 0 || radiusY <= 0) {
    return {
      top: polyline100([left, top], [right, top]),
      right: polyline100([right, top], [right, bottom]),
      bottom: polyline100([left, bottom], [right, bottom]),
      left: polyline100([left, top], [left, bottom])
    }
  }

  const topLeftCenterX = left + radiusX
  const topLeftCenterY = top + radiusY
  const topRightCenterX = right - radiusX
  const topRightCenterY = top + radiusY
  const bottomRightCenterX = right - radiusX
  const bottomRightCenterY = bottom - radiusY
  const bottomLeftCenterX = left + radiusX
  const bottomLeftCenterY = bottom - radiusY

  return {
    top: joinPolyline(
      createEllipseArc(180, 270, {
        centerX: topLeftCenterX,
        centerY: topLeftCenterY,
        radiusX,
        radiusY
      }),
      polyline100([topRightCenterX, top]),
      createEllipseArc(270, 360, {
        centerX: topRightCenterX,
        centerY: topRightCenterY,
        radiusX,
        radiusY
      })
    ),
    right: joinPolyline(
      createEllipseArc(270, 360, {
        centerX: topRightCenterX,
        centerY: topRightCenterY,
        radiusX,
        radiusY
      }),
      polyline100([right, bottomRightCenterY]),
      createEllipseArc(0, 90, {
        centerX: bottomRightCenterX,
        centerY: bottomRightCenterY,
        radiusX,
        radiusY
      })
    ),
    bottom: joinPolyline(
      createEllipseArc(180, 90, {
        centerX: bottomLeftCenterX,
        centerY: bottomLeftCenterY,
        radiusX,
        radiusY
      }),
      polyline100([bottomRightCenterX, bottom]),
      createEllipseArc(90, 0, {
        centerX: bottomRightCenterX,
        centerY: bottomRightCenterY,
        radiusX,
        radiusY
      })
    ),
    left: joinPolyline(
      createEllipseArc(270, 180, {
        centerX: topLeftCenterX,
        centerY: topLeftCenterY,
        radiusX,
        radiusY
      }),
      polyline100([left, bottomLeftCenterY]),
      createEllipseArc(180, 90, {
        centerX: bottomLeftCenterX,
        centerY: bottomLeftCenterY,
        radiusX,
        radiusY
      })
    )
  }
}

const RECT_OUTLINE = createRoundedRectOutline({
  left: 3,
  top: 3,
  right: 97,
  bottom: 97,
  radiusX: 0,
  radiusY: 0
})

const ROUNDED_RECT_OUTLINE = createRoundedRectOutline({
  left: 3,
  top: 3,
  right: 97,
  bottom: 97,
  radiusX: 14,
  radiusY: 14
})

const PILL_OUTLINE = createRoundedRectOutline({
  left: 3,
  top: 3,
  right: 97,
  bottom: 97,
  radiusX: 47,
  radiusY: 47
})

const DIAMOND_OUTLINE: OutlineSpec = {
  top: polyline100([3, 50], [50, 3], [97, 50]),
  right: polyline100([50, 3], [97, 50], [50, 97]),
  bottom: polyline100([3, 50], [50, 97], [97, 50]),
  left: polyline100([50, 3], [3, 50], [50, 97])
}

const TRIANGLE_OUTLINE: OutlineSpec = {
  top: polyline100([3, 97], [50, 3], [97, 97]),
  right: polyline100([50, 3], [97, 97]),
  bottom: polyline100([3, 97], [97, 97]),
  left: polyline100([50, 3], [3, 97])
}

const HEXAGON_OUTLINE: OutlineSpec = {
  top: polyline100([22, 3], [78, 3]),
  right: polyline100([78, 3], [97, 50], [78, 97]),
  bottom: polyline100([22, 97], [78, 97]),
  left: polyline100([22, 3], [3, 50], [22, 97])
}

const PARALLELOGRAM_OUTLINE: OutlineSpec = {
  top: polyline100([20, 3], [97, 3]),
  right: polyline100([97, 3], [80, 97]),
  bottom: polyline100([3, 97], [80, 97]),
  left: polyline100([20, 3], [3, 97])
}

const CYLINDER_OUTLINE: OutlineSpec = {
  top: createCubicCurve(
    [10, 14],
    [10, 4],
    [90, 4],
    [90, 14]
  ),
  right: polyline100([90, 14], [90, 86]),
  bottom: createCubicCurve(
    [10, 86],
    [10, 96],
    [90, 96],
    [90, 86]
  ),
  left: polyline100([10, 14], [10, 86])
}

const DOCUMENT_OUTLINE: OutlineSpec = {
  top: polyline100([3, 3], [97, 3]),
  right: polyline100([97, 3], [97, 84]),
  bottom: joinPolyline(
    createCubicCurve(
      [3, 84],
      [16, 74],
      [32, 96],
      [50, 84]
    ),
    createCubicCurve(
      [50, 84],
      [68, 74],
      [84, 96],
      [97, 84]
    )
  ),
  left: polyline100([3, 3], [3, 84])
}

const CALLOUT_OUTLINE: OutlineSpec = {
  top: joinPolyline(
    createCubicCurve(
      [3, 13],
      [3, 8],
      [5, 4],
      [9, 4]
    ),
    polyline100([91, 4]),
    createCubicCurve(
      [91, 4],
      [95, 4],
      [97, 8],
      [97, 13]
    )
  ),
  right: joinPolyline(
    polyline100([97, 13], [97, 71]),
    createCubicCurve(
      [97, 71],
      [97, 78],
      [92, 82],
      [86, 82]
    )
  ),
  bottom: polyline100(
    [14, 82],
    [40, 82],
    [35, 97],
    [58, 82],
    [86, 82]
  ),
  left: joinPolyline(
    createCubicCurve(
      [9, 4],
      [5, 4],
      [3, 8],
      [3, 13]
    ),
    polyline100([3, 71]),
    createCubicCurve(
      [3, 71],
      [3, 78],
      [8, 82],
      [14, 82]
    )
  )
}

const CLOUD_OUTLINE: OutlineSpec = {
  top: joinPolyline(
    createCubicCurve(
      [23, 33],
      [29, 23],
      [39, 17],
      [50, 17]
    ),
    createCubicCurve(
      [50, 17],
      [62, 17],
      [74, 27],
      [77, 43]
    )
  ),
  right: joinPolyline(
    createCubicCurve(
      [77, 43],
      [89, 44],
      [97, 53],
      [97, 65]
    ),
    createCubicCurve(
      [97, 65],
      [97, 77],
      [88, 86],
      [76, 86]
    )
  ),
  bottom: joinPolyline(
    createCubicCurve(
      [23, 75],
      [22, 81],
      [22, 84],
      [23, 86]
    ),
    polyline100([76, 86])
  ),
  left: joinPolyline(
    createCubicCurve(
      [23, 33],
      [11, 33],
      [3, 42],
      [3, 53]
    ),
    createCubicCurve(
      [3, 53],
      [3, 65],
      [12, 75],
      [23, 75]
    )
  )
}

const ARROW_OUTLINE: OutlineSpec = {
  top: polyline100([3, 25], [58, 25], [58, 4], [97, 50]),
  right: polyline100([58, 4], [97, 50], [58, 96]),
  bottom: polyline100([3, 75], [58, 75], [58, 96], [97, 50]),
  left: polyline100([3, 25], [3, 75])
}

const ELLIPSE_OUTLINE: OutlineSpec = {
  top: createEllipseArc(180, 360, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  }),
  right: createEllipseArc(270, 450, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  }),
  bottom: createEllipseArc(180, 0, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  }),
  left: createEllipseArc(270, 90, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  })
}

const HIGHLIGHT_OUTLINE = createRoundedRectOutline({
  left: 3,
  top: 22,
  right: 97,
  bottom: 78,
  radiusX: 18,
  radiusY: 18
})

const OUTLINE_BY_SHAPE_KIND: Record<ShapeKind, OutlineSpec> = {
  rect: RECT_OUTLINE,
  'rounded-rect': ROUNDED_RECT_OUTLINE,
  pill: PILL_OUTLINE,
  ellipse: ELLIPSE_OUTLINE,
  diamond: DIAMOND_OUTLINE,
  triangle: TRIANGLE_OUTLINE,
  hexagon: HEXAGON_OUTLINE,
  parallelogram: PARALLELOGRAM_OUTLINE,
  cylinder: CYLINDER_OUTLINE,
  document: DOCUMENT_OUTLINE,
  'predefined-process': RECT_OUTLINE,
  callout: CALLOUT_OUTLINE,
  cloud: CLOUD_OUTLINE,
  'arrow-sticker': ARROW_OUTLINE,
  highlight: HIGHLIGHT_OUTLINE
}

const getOutlineSpec = (
  node: Pick<Node, 'type' | 'data'>
): OutlineSpec => {
  if (node.type !== 'shape') {
    return RECT_OUTLINE
  }

  return OUTLINE_BY_SHAPE_KIND[readShapeKind(node)]
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

const readShapeStrokeWidth = (
  node: Pick<Node, 'type' | 'style'>
) => {
  if (node.type !== 'shape') {
    return 0
  }

  const raw = node.style?.strokeWidth
  const value = typeof raw === 'string'
    ? Number(raw)
    : raw

  return Number.isFinite(value)
    ? Math.max(0, value as number)
    : 1
}

const expandOutlineBounds = (
  rect: Rect,
  node: Pick<Node, 'type' | 'style'>,
  bounds: Rect
) => {
  const strokeWidth = readShapeStrokeWidth(node)
  if (strokeWidth <= 0) {
    return bounds
  }

  const expansion = Math.max(
    rect.width * (strokeWidth / OUTLINE_VIEWBOX) / 2,
    rect.height * (strokeWidth / OUTLINE_VIEWBOX) / 2
  )

  return expandRect(bounds, expansion)
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

export const getNodeAnchorPoint = (
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

export const getNodeOutlineRect = (
  node: Pick<Node, 'type' | 'data' | 'style'>,
  rect: Rect
): Rect => {
  if (node.type !== 'shape') {
    return rect
  }

  return expandOutlineBounds(
    rect,
    node,
    getAABBFromPoints(readOutlinePoints(node, rect))
  )
}

export const getNodeOutlineBounds = (
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

  return expandOutlineBounds(
    rect,
    node,
    getAABBFromPoints(points)
  )
}

export const getNodeAnchorFromPoint = (
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
    point: getNodeAnchorPoint(node, rect, anchor, rotation, anchorOffset)
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
      point: getNodeAnchorPoint(node, rect, anchor, rotation, anchor.offset)
    }
  }

  return getNodeAnchorFromPoint(
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
