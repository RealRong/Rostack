import type { Point, Rect } from '#whiteboard-core/types'

export const distancePointToSegment = (
  point: Point,
  a: Point,
  b: Point
) => {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = point.x - a.x
  const apy = point.y - a.y
  const abLengthSquared = abx * abx + aby * aby

  if (abLengthSquared === 0) {
    return Math.hypot(apx, apy)
  }

  const t = Math.max(
    0,
    Math.min(1, (apx * abx + apy * aby) / abLengthSquared)
  )
  const closest = { x: a.x + abx * t, y: a.y + aby * t }
  return Math.hypot(point.x - closest.x, point.y - closest.y)
}

export const getSegmentBounds = (
  a: Point,
  b: Point,
  padding = 0
): Rect => ({
  x: Math.min(a.x, b.x) - padding,
  y: Math.min(a.y, b.y) - padding,
  width: Math.abs(b.x - a.x) + padding * 2,
  height: Math.abs(b.y - a.y) + padding * 2
})
