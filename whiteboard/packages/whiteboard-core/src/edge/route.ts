import type { EdgeRoute, Point } from '@whiteboard/core/types'

export const readEdgeRoutePoints = (
  route: EdgeRoute | undefined
): readonly Point[] => (
  route?.kind === 'manual'
    ? route.points
    : []
)
