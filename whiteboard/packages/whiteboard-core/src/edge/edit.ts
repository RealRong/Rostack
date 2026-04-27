import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { Edge, EdgeId, EdgePatch, Point } from '@whiteboard/core/types'
import type { EdgeHandle } from '@whiteboard/core/types/edge'
import { clearRoute, setRoutePoints } from '@whiteboard/core/edge/ops'

export type EdgeRouteHandlePick = {
  index?: number
  insert?: number
  segment?: number
}

export type EdgeRouteHandleTarget =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'segment'
      edgeId: EdgeId
      index: number
      segmentIndex: number
      role: 'insert' | 'control'
      axis: 'x' | 'y'
      point: Point
    }

export type EdgeRoutePoint = {
  key: string
  kind: 'anchor' | 'insert' | 'control'
  edgeId: EdgeId
  point: Point
  active: boolean
  deletable: boolean
  pick:
    | {
        kind: 'anchor'
        index: number
      }
    | {
        kind: 'segment'
        insertIndex: number
        segmentIndex: number
        axis: 'x' | 'y'
      }
}

export const resolveEdgeRouteHandleTarget = (input: {
  edgeId: EdgeId
  handles: readonly EdgeHandle[]
  pick: EdgeRouteHandlePick
}): EdgeRouteHandleTarget | undefined => {
  if (input.pick.index !== undefined) {
    const handle = input.handles.find((entry) => (
      entry.kind === 'anchor'
      && entry.index === input.pick.index
    ))

    return handle?.kind === 'anchor'
      ? {
          kind: 'anchor',
          edgeId: input.edgeId,
          index: handle.index,
          point: handle.point
        }
      : undefined
  }

  const segmentIndex = input.pick.segment
  const insertIndex = input.pick.insert ?? 0
  const handle = input.handles.find((entry) => (
    entry.kind === 'segment'
    && (
      segmentIndex !== undefined
        ? entry.segmentIndex === segmentIndex
        : entry.insertIndex === insertIndex
    )
  ))

  return handle?.kind === 'segment'
    ? {
        kind: 'segment',
        edgeId: input.edgeId,
        index: handle.insertIndex,
        segmentIndex: handle.segmentIndex,
        role: handle.role,
        axis: handle.axis,
        point: handle.point
      }
    : undefined
}

export const readEdgeRoutePoints = (input: {
  edgeId: EdgeId
  edge: Edge
  handles: readonly EdgeHandle[]
  activeRouteIndex?: number
}): readonly EdgeRoutePoint[] => {
  const isStepManual =
    (input.edge.type === 'elbow' || input.edge.type === 'fillet')
    && input.edge.route?.kind === 'manual'

  return input.handles.flatMap<EdgeRoutePoint>((handle) => {
    if (handle.kind === 'anchor') {
      if (isStepManual) {
        return []
      }

      return [{
        key: `${input.edgeId}:anchor:${handle.index}`,
        kind: 'anchor',
        edgeId: input.edgeId,
        point: handle.point,
        active: input.activeRouteIndex === handle.index,
        deletable: true,
        pick: {
          kind: 'anchor',
          index: handle.index
        }
      }]
    }

    if (handle.kind === 'segment') {
      return [{
        key: `${input.edgeId}:${handle.role}:${handle.segmentIndex}`,
        kind: handle.role,
        edgeId: input.edgeId,
        point: handle.point,
        active: input.activeRouteIndex === handle.insertIndex,
        deletable: false,
        pick: {
          kind: 'segment',
          insertIndex: handle.insertIndex,
          segmentIndex: handle.segmentIndex,
          axis: handle.axis
        }
      }]
    }

    return []
  })
}

export const createRoutePatchFromPathPoints = (
  edge: Edge,
  pathPoints: readonly Point[]
): EdgePatch => {
  const routePoints = geometryApi.polyline.normalize(pathPoints).slice(1, -1)

  return routePoints.length > 0
    ? setRoutePoints(edge, routePoints)
    : clearRoute(edge)
}

const movePointAlongAxis = (
  point: Point,
  axis: 'x' | 'y',
  delta: number
): Point => (
  axis === 'x'
    ? { x: point.x + delta, y: point.y }
    : { x: point.x, y: point.y + delta }
)

export const moveElbowRouteSegmentPoints = (input: {
  pathPoints: readonly Point[]
  segmentIndex: number
  axis: 'x' | 'y'
  delta: number
}): Point[] => {
  const start = input.pathPoints[input.segmentIndex]
  const end = input.pathPoints[input.segmentIndex + 1]
  if (!start || !end) {
    return [...input.pathPoints]
  }

  if (input.delta === 0) {
    return [...input.pathPoints]
  }

  if (input.pathPoints.length === 2) {
    return geometryApi.polyline.normalize([
      input.pathPoints[0]!,
      movePointAlongAxis(start, input.axis, input.delta),
      movePointAlongAxis(end, input.axis, input.delta),
      input.pathPoints[1]!
    ])
  }

  const next = [...input.pathPoints]
  const shiftedStart = movePointAlongAxis(start, input.axis, input.delta)
  const shiftedEnd = movePointAlongAxis(end, input.axis, input.delta)

  if (input.segmentIndex === 0) {
    next.splice(0, 2, next[0]!, shiftedStart, shiftedEnd)
    return geometryApi.polyline.normalize(next)
  }

  if (input.segmentIndex === input.pathPoints.length - 2) {
    next.splice(input.segmentIndex, 2, shiftedStart, shiftedEnd, input.pathPoints[input.pathPoints.length - 1]!)
    return geometryApi.polyline.normalize(next)
  }

  next.splice(input.segmentIndex, 2, shiftedStart, shiftedEnd)
  return geometryApi.polyline.normalize(next)
}

export const moveElbowRouteSegment = (input: {
  edge: Edge
  pathPoints: readonly Point[]
  segmentIndex: number
  axis: 'x' | 'y'
  delta: number
}): EdgePatch | undefined => {
  if (input.delta === 0) {
    return undefined
  }

  return createRoutePatchFromPathPoints(
    input.edge,
    moveElbowRouteSegmentPoints({
      pathPoints: input.pathPoints,
      segmentIndex: input.segmentIndex,
      axis: input.axis,
      delta: input.delta
    })
  )
}

export const areRoutePointsEqual = geometryApi.polyline.equal
