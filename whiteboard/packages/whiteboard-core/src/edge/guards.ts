import type {
  EdgeEnd,
  NodeEdgeEnd,
  PointEdgeEnd
} from '@whiteboard/core/types'

export const isNodeEdgeEnd = (
  value: EdgeEnd
): value is NodeEdgeEnd => value.kind === 'node'

export const isPointEdgeEnd = (
  value: EdgeEnd
): value is PointEdgeEnd => value.kind === 'point'

export const hasManualEdgePoints = <T>(
  points: T[] | { ids: readonly string[] } | undefined
): boolean => Array.isArray(points)
  ? points.length > 0
  : Boolean(points?.ids.length)
