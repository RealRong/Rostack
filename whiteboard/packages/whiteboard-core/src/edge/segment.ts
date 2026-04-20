import type { Point } from '@whiteboard/core/types'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { EdgePathSegment } from '@whiteboard/core/types/edge'

export const getNearestEdgeInsertIndex = (
  pointWorld: Point,
  segments: readonly EdgePathSegment[]
) => {
  if (!segments.length) return 0

  let minDistance = Number.POSITIVE_INFINITY
  let minIndex = Math.max(0, segments.length - 1)

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const hitPoints = segment.hitPoints
    const distance = hitPoints && hitPoints.length >= 2
      ? hitPoints.reduce((minDistance, point, pointIndex) => {
          if (pointIndex === 0) {
            return minDistance
          }
          return Math.min(
            minDistance,
            geometryApi.segment.distanceToPoint(pointWorld, hitPoints[pointIndex - 1], point)
          )
        }, Number.POSITIVE_INFINITY)
      : geometryApi.segment.distanceToPoint(pointWorld, segment.from, segment.to)
    if (distance < minDistance) {
      minDistance = distance
      minIndex = index
    }
  }

  return segments[minIndex]?.insertIndex ?? 0
}
