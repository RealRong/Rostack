import type { Point, Rect } from '../types'
import { rotatePoint } from './point'
import { getRectCenter, getRectCorners } from './rect'

export const getRotatedCorners = (rect: Rect, rotation = 0): Point[] => {
  if (!rotation) {
    return getRectCorners(rect)
  }

  const center = getRectCenter(rect)
  const corners = getRectCorners(rect)

  return corners.map((corner) => rotatePoint(corner, center, rotation))
}

export const isPointInRotatedRect = (
  point: Point,
  rect: Rect,
  rotation = 0
): boolean => {
  if (!rotation) {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    )
  }

  const center = getRectCenter(rect)
  const local = rotatePoint(point, center, -rotation)
  return (
    local.x >= rect.x &&
    local.x <= rect.x + rect.width &&
    local.y >= rect.y &&
    local.y <= rect.y + rect.height
  )
}
