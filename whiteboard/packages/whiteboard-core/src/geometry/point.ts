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

export const quantizePointToAngleStep = ({
  point,
  origin,
  stepDegrees
}: {
  point: Point
  origin: Point
  stepDegrees: number
}): Point => {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const distance = Math.hypot(dx, dy)

  if (distance === 0 || stepDegrees <= 0) {
    return {
      x: point.x,
      y: point.y
    }
  }

  const step = degToRad(stepDegrees)
  const angle = Math.atan2(dy, dx)
  const quantizedAngle = Math.round(angle / step) * step

  return {
    x: origin.x + Math.cos(quantizedAngle) * distance,
    y: origin.y + Math.sin(quantizedAngle) * distance
  }
}

export const quantizePointToOctilinear = ({
  point,
  origin
}: {
  point: Point
  origin: Point
}): Point => quantizePointToAngleStep({
  point,
  origin,
  stepDegrees: 45
})
