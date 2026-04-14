import type { Point, Rect } from '@whiteboard/core/types'
import { getRectCorners, rectIntersects } from '@whiteboard/core/geometry/rect'
import { getRotatedCorners } from '@whiteboard/core/geometry/rotation'

const projectPoints = (points: Point[], axis: Point) => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  points.forEach((point) => {
    const value = point.x * axis.x + point.y * axis.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  })

  return { min, max }
}

const getAxes = (points: Point[]) => {
  const axes: Point[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const edge = { x: next.x - current.x, y: next.y - current.y }
    axes.push({ x: -edge.y, y: edge.x })
  }
  return axes
}

export const rectIntersectsRotatedRect = (
  outer: Rect,
  rect: Rect,
  rotation = 0
): boolean => {
  if (!rotation) return rectIntersects(outer, rect)

  const outerCorners = getRectCorners(outer)
  const rectCorners = getRotatedCorners(rect, rotation)
  const axes = [...getAxes(outerCorners), ...getAxes(rectCorners)]

  for (const axis of axes) {
    const outerProjection = projectPoints(outerCorners, axis)
    const rectProjection = projectPoints(rectCorners, axis)
    if (
      outerProjection.max < rectProjection.min ||
      rectProjection.max < outerProjection.min
    ) {
      return false
    }
  }

  return true
}

export const rectContainsRotatedRect = (
  outer: Rect,
  rect: Rect,
  rotation = 0
): boolean => {
  const corners = rotation ? getRotatedCorners(rect, rotation) : getRectCorners(rect)
  return corners.every(
    (point) =>
      point.x >= outer.x &&
      point.x <= outer.x + outer.width &&
      point.y >= outer.y &&
      point.y <= outer.y + outer.height
  )
}
