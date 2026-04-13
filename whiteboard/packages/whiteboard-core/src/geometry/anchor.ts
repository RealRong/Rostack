import type { EdgeAnchor, Point, Rect } from '#whiteboard-core/types'
import { rotatePoint } from '#whiteboard-core/geometry/point'
import { getRectCenter } from '#whiteboard-core/geometry/rect'

export const getAnchorPoint = (
  rect: Rect,
  anchor?: EdgeAnchor,
  rotation = 0,
  defaultOffset = 0.5
): Point => {
  if (!anchor) {
    return getRectCenter(rect)
  }

  const offset = Number.isFinite(anchor.offset)
    ? anchor.offset
    : defaultOffset
  let point: Point

  switch (anchor.side) {
    case 'top':
      point = { x: rect.x + rect.width * offset, y: rect.y }
      break
    case 'right':
      point = { x: rect.x + rect.width, y: rect.y + rect.height * offset }
      break
    case 'bottom':
      point = { x: rect.x + rect.width * offset, y: rect.y + rect.height }
      break
    case 'left':
      point = { x: rect.x, y: rect.y + rect.height * offset }
      break
    default:
      point = getRectCenter(rect)
      break
  }

  if (!rotation) return point
  return rotatePoint(point, getRectCenter(rect), rotation)
}
