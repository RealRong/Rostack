import type { EdgeRoute, Point } from '../types'

export const readEdgeRoutePoints = (
  route: EdgeRoute | undefined
): readonly Point[] => (
  route?.kind === 'manual'
    ? route.points
    : []
)
