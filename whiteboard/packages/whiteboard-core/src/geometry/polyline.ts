import type { Point } from '@whiteboard/core/types'
import { isPointEqual } from '@whiteboard/core/geometry/equality'

export const normalizePolylinePoints = (
  points: readonly Point[]
) => {
  const normalized: Point[] = []

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const last = normalized[normalized.length - 1]

    if (!last) {
      normalized.push(point)
      continue
    }

    if (isPointEqual(last, point)) {
      continue
    }

    normalized.push(point)

    while (normalized.length >= 3) {
      const right = normalized[normalized.length - 1]!
      const middle = normalized[normalized.length - 2]!
      const left = normalized[normalized.length - 3]!
      const collinear =
        (left.x === middle.x && middle.x === right.x)
        || (left.y === middle.y && middle.y === right.y)

      if (!collinear) {
        break
      }

      normalized.splice(normalized.length - 2, 1)
    }
  }

  return normalized
}

export const arePointListsEqual = (
  left: readonly Point[],
  right: readonly Point[]
) => (
  left.length === right.length
  && left.every((point, index) => isPointEqual(point, right[index]!))
)
