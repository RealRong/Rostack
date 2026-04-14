import type { Point } from '@whiteboard/core/types'
import { degToRad } from '@whiteboard/core/geometry/scalar'

export const rotatePoint = (
  point: Point,
  center: Point,
  rotation = 0
): Point => {
  if (!rotation) return { x: point.x, y: point.y }

  const angle = degToRad(rotation)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  }
}
