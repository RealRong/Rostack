import type {
  EdgeEnd,
  EdgeRoute,
  NodeEdgeEnd,
  PointEdgeEnd
} from '#whiteboard-core/types'

export const isNodeEdgeEnd = (
  value: EdgeEnd
): value is NodeEdgeEnd => value.kind === 'node'

export const isPointEdgeEnd = (
  value: EdgeEnd
): value is PointEdgeEnd => value.kind === 'point'

export const isManualEdgeRoute = (
  route: EdgeRoute | undefined
): route is Extract<EdgeRoute, { kind: 'manual' }> =>
  route?.kind === 'manual'
