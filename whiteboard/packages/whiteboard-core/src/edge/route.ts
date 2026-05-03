import { entityTable } from '@shared/core'
import type { EdgeRoutePoint, Point } from '@whiteboard/core/types'
import type { EntityTable } from '@shared/core'

export const readEdgePoints = (
  points: EntityTable<string, EdgeRoutePoint> | undefined
): readonly Point[] => (
  points
    ? entityTable.read.list(points)
    : []
)
