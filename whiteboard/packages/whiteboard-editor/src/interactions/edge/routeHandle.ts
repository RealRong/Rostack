import { isPointEqual } from '@whiteboard/core/geometry'
import type { Edge, EdgeId, EdgePatch, Point } from '@whiteboard/core/types'
import {
  areRoutePointsEqual,
  moveElbowRouteSegment,
  moveRoutePoint
} from '@whiteboard/core/edge'

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

    const patch = moveElbowRouteSegment({
      edge: input.edge,
      pathPoints: input.state.pathPoints,
      segmentIndex: input.state.segmentIndex,
      axis: input.state.axis,
      delta
    })
    if (!patch) {
      return {
        state: input.state
      }
    }

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
          areRoutePointsEqual(state.routePoints, state.baseRoutePoints)
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
