import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { Point, Rect } from '@whiteboard/core/types'
import type {
  EdgePathResult,
  EdgePathSegment,
  EdgeRectHitMode
} from '@whiteboard/core/types/edge'

const toSegmentPoints = (
  segment: EdgePathSegment
): readonly Point[] => (
  segment.hitPoints && segment.hitPoints.length >= 2
    ? segment.hitPoints
    : [segment.from, segment.to]
)

const cross = (
  a: Point,
  b: Point,
  c: Point
) => (
  (b.x - a.x) * (c.y - a.y)
  - (b.y - a.y) * (c.x - a.x)
)

const isBetween = (
  value: number,
  left: number,
  right: number
) => (
  value >= Math.min(left, right)
  && value <= Math.max(left, right)
)

const isPointOnSegment = (
  point: Point,
  from: Point,
  to: Point
) => (
  cross(from, to, point) === 0
  && isBetween(point.x, from.x, to.x)
  && isBetween(point.y, from.y, to.y)
)

const segmentsIntersect = (
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
) => {
  const d1 = cross(a1, a2, b1)
  const d2 = cross(a1, a2, b2)
  const d3 = cross(b1, b2, a1)
  const d4 = cross(b1, b2, a2)

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true
  }

  return (
    (d1 === 0 && isPointOnSegment(b1, a1, a2))
    || (d2 === 0 && isPointOnSegment(b2, a1, a2))
    || (d3 === 0 && isPointOnSegment(a1, b1, b2))
    || (d4 === 0 && isPointOnSegment(a2, b1, b2))
  )
}

const segmentIntersectsRect = (
  from: Point,
  to: Point,
  rect: Rect
) => {
  if (geometryApi.rect.containsPoint(from, rect) || geometryApi.rect.containsPoint(to, rect)) {
    return true
  }

  const topLeft = { x: rect.x, y: rect.y }
  const topRight = { x: rect.x + rect.width, y: rect.y }
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height }
  const bottomLeft = { x: rect.x, y: rect.y + rect.height }

  return (
    segmentsIntersect(from, to, topLeft, topRight)
    || segmentsIntersect(from, to, topRight, bottomRight)
    || segmentsIntersect(from, to, bottomRight, bottomLeft)
    || segmentsIntersect(from, to, bottomLeft, topLeft)
  )
}

const getPathPoints = (
  path: Pick<EdgePathResult, 'points' | 'segments'>
): Point[] => {
  const points: Point[] = []

  if (path.segments.length > 0) {
    path.segments.forEach((segment) => {
      toSegmentPoints(segment).forEach((point) => {
        points.push(point)
      })
    })
    return points
  }

  return [...path.points]
}

export const getEdgePathBounds = (
  path: Pick<EdgePathResult, 'points' | 'segments'>
): Rect | undefined => {
  const points = getPathPoints(path)
  if (!points.length) {
    return undefined
  }

  return geometryApi.rect.aabbFromPoints(points)
}

export const matchEdgeRect = ({
  path,
  queryRect,
  mode
}: {
  path: Pick<EdgePathResult, 'points' | 'segments'>
  queryRect: Rect
  mode: EdgeRectHitMode
}) => {
  const bounds = getEdgePathBounds(path)
  if (!bounds) {
    return false
  }

  if (mode === 'contain') {
    return geometryApi.rect.contains(queryRect, bounds)
  }

  if (!geometryApi.rect.intersects(queryRect, bounds)) {
    return false
  }

  if (path.segments.length === 0) {
    return path.points.some((point) => geometryApi.rect.containsPoint(point, queryRect))
  }

  return path.segments.some((segment) => {
    const points = toSegmentPoints(segment)

    for (let index = 1; index < points.length; index += 1) {
      if (segmentIntersectsRect(points[index - 1]!, points[index]!, queryRect)) {
        return true
      }
    }

    return false
  })
}
