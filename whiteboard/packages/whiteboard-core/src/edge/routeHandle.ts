import { isPointEqual } from '../geometry'
import type { EdgeHandle } from '../types/edge'
import type { Edge, EdgeId, EdgePatch, Point } from '../types'
import { moveRoutePoint, clearRoute, setRoutePoints } from './commands'

export type RouteHandleTarget =
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

export type RouteHandleState =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      pointerId: number
      startWorld: Point
      origin: Point
      point: Point
    }
  | {
      kind: 'segment'
      edgeId: EdgeId
      index: number
      segmentIndex: number
      axis: 'x' | 'y'
      pointerId: number
      startWorld: Point
      origin: Point
      pathPoints: readonly Point[]
      baseRoutePoints: readonly Point[]
      routePoints: readonly Point[]
    }

export type RouteHandleDraft = {
  patch?: EdgePatch
  activeRouteIndex: number
}

export type RouteHandleCommit = {
  edgeId: EdgeId
  index: number
  point?: Point
  route?: EdgePatch['route']
}

export const resolveRouteHandleTarget = (input: {
  edgeId: EdgeId
  handles: readonly EdgeHandle[]
  pick: {
    index?: number
    insert?: number
    segment?: number
  }
}): RouteHandleTarget | undefined => {
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

export const startRouteHandleState = (input: {
  edgeId: EdgeId
  index: number
  pointerId: number
  startWorld: Point
  origin: Point
  point?: Point
  kind?: 'anchor'
}): RouteHandleState => ({
    kind: input.kind ?? 'anchor',
    edgeId: input.edgeId,
    index: input.index,
    pointerId: input.pointerId,
    startWorld: input.startWorld,
    origin: input.origin,
    point: input.point ?? input.origin
  })

const normalizePolylinePoints = (
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

const toManualRoutePatch = (
  edge: Edge,
  pathPoints: readonly Point[]
) => {
  const normalized = normalizePolylinePoints(pathPoints)
  const routePoints = normalized.slice(1, -1)

  return routePoints.length > 0
    ? setRoutePoints(edge, routePoints)
    : clearRoute(edge)
}

const moveStepSegmentPath = ({
  pathPoints,
  segmentIndex,
  axis,
  pointerWorld,
  startWorld
}: {
  pathPoints: readonly Point[]
  segmentIndex: number
  axis: 'x' | 'y'
  pointerWorld: Point
  startWorld: Point
}) => {
  const start = pathPoints[segmentIndex]
  const end = pathPoints[segmentIndex + 1]
  if (!start || !end) {
    return pathPoints
  }

  const delta =
    axis === 'x'
      ? pointerWorld.x - startWorld.x
      : pointerWorld.y - startWorld.y
  const next = [...pathPoints]

  if (pathPoints.length === 2) {
    if (axis === 'x') {
      return normalizePolylinePoints([
        next[0]!,
        { x: start.x + delta, y: start.y },
        { x: end.x + delta, y: end.y },
        next[1]!
      ])
    }

    return normalizePolylinePoints([
      next[0]!,
      { x: start.x, y: start.y + delta },
      { x: end.x, y: end.y + delta },
      next[1]!
    ])
  }

  const shiftedStart =
    axis === 'x'
      ? { x: start.x + delta, y: start.y }
      : { x: start.x, y: start.y + delta }
  const shiftedEnd =
    axis === 'x'
      ? { x: end.x + delta, y: end.y }
      : { x: end.x, y: end.y + delta }

  if (segmentIndex === 0) {
    next.splice(0, 2, next[0]!, shiftedStart, shiftedEnd)
    return normalizePolylinePoints(next)
  }

  if (segmentIndex === pathPoints.length - 2) {
    next.splice(segmentIndex, 2, shiftedStart, shiftedEnd, next[pathPoints.length - 1]!)
    return normalizePolylinePoints(next)
  }

  next.splice(segmentIndex, 2, shiftedStart, shiftedEnd)
  return normalizePolylinePoints(next)
}

export const startStepSegmentRouteHandleState = (input: {
  edgeId: EdgeId
  index: number
  segmentIndex: number
  axis: 'x' | 'y'
  pointerId: number
  startWorld: Point
  origin: Point
  pathPoints: readonly Point[]
  baseRoutePoints: readonly Point[]
}): RouteHandleState => ({
    kind: 'segment',
    edgeId: input.edgeId,
    index: input.index,
    segmentIndex: input.segmentIndex,
    axis: input.axis,
    pointerId: input.pointerId,
    startWorld: input.startWorld,
    origin: input.origin,
    pathPoints: input.pathPoints,
    baseRoutePoints: input.baseRoutePoints,
    routePoints: input.baseRoutePoints
  })

export const stepRouteHandleState = (input: {
  state: RouteHandleState
  edge: Edge
  pointerWorld: Point
}): {
  state: RouteHandleState
  draft?: RouteHandleDraft
} => {
  if (input.state.kind === 'segment') {
    const delta =
      input.state.axis === 'x'
        ? input.pointerWorld.x - input.state.startWorld.x
        : input.pointerWorld.y - input.state.startWorld.y
    if (delta === 0) {
      return {
        state: input.state
      }
    }

    const nextPathPoints = moveStepSegmentPath({
      pathPoints: input.state.pathPoints,
      segmentIndex: input.state.segmentIndex,
      axis: input.state.axis,
      pointerWorld: input.pointerWorld,
      startWorld: input.state.startWorld
    })
    const patch = toManualRoutePatch(input.edge, nextPathPoints)

    return {
      state: {
        ...input.state,
        routePoints:
          patch.route?.kind === 'manual'
            ? patch.route.points
            : []
      },
      draft: {
        patch,
        activeRouteIndex: input.state.index
      }
    }
  }

  const point = {
    x: input.state.origin.x + (input.pointerWorld.x - input.state.startWorld.x),
    y: input.state.origin.y + (input.pointerWorld.y - input.state.startWorld.y)
  }
  if (isPointEqual(point, input.state.point)) {
    return {
      state: input.state
    }
  }

  return {
    state: {
      ...input.state,
      point
    },
    draft: {
      patch: moveRoutePoint(input.edge, input.state.index, point),
      activeRouteIndex: input.state.index
    }
  }
}

export const finishRouteHandleState = (
  state: RouteHandleState
): RouteHandleCommit => ({
    edgeId: state.edgeId,
    index: state.index,
    point:
      state.kind === 'anchor'
        ? (
            isPointEqual(state.point, state.origin)
              ? undefined
              : state.point
          )
        : undefined,
    route:
      state.kind === 'segment'
        ? (
            state.routePoints.length === state.baseRoutePoints.length
            && state.routePoints.every((point, index) => isPointEqual(point, state.baseRoutePoints[index]!))
              ? undefined
              : (
                  state.routePoints.length > 0
                    ? {
                        kind: 'manual',
                        points: [...state.routePoints]
                      }
                    : {
                        kind: 'auto'
                      }
                )
          )
        : undefined
  })
