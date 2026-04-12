import {
  resolveEdgeRouteHandleTarget,
  moveElbowRouteSegment,
  moveRoutePoint,
  areRoutePointsEqual,
  type EdgeRouteHandleTarget
} from '@whiteboard/core/edge'
import { isPointEqual } from '@whiteboard/core/geometry'
import type { Edge, EdgeId, EdgePatch, Point } from '@whiteboard/core/types'
import type { PointerDownInput } from '../../types/input'
import type { EdgeRead, EdgeView } from '../read/edge'

export type EdgeRouteHandleState =
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

export type EdgeRouteHandleDraft = {
  patch?: EdgePatch
  activeRouteIndex: number
}

export type EdgeRouteHandleCommit = {
  edgeId: EdgeId
  index: number
  point?: Point
  route?: EdgePatch['route']
}

type EdgeRoutePick = Extract<PointerDownInput['pick'], {
  kind: 'edge'
}> & {
  part: 'path'
}

const isEdgeRoutePick = (
  pick: PointerDownInput['pick']
): pick is EdgeRoutePick => (
  pick.kind === 'edge'
  && pick.part === 'path'
)

const readEditableRouteView = (
  edge: Pick<EdgeRead, 'resolved' | 'item' | 'capability'>,
  edgeId: EdgeId
): EdgeView | undefined => {
  const view = edge.resolved.get(edgeId)
  const item = edge.item.get(edgeId)

  return view && item && edge.capability(item.edge).editRoute
    ? view
    : undefined
}

export const resolveEdgeRoutePickTarget = (
  edge: Pick<EdgeRead, 'resolved' | 'item' | 'capability'>,
  pick: PointerDownInput['pick']
): EdgeRouteHandleTarget | undefined => {
  if (!isEdgeRoutePick(pick)) {
    return undefined
  }

  const view = readEditableRouteView(edge, pick.id)
  if (!view) {
    return undefined
  }

  return resolveEdgeRouteHandleTarget({
    edgeId: pick.id,
    handles: view.handles,
    pick: {
      index: pick.index,
      insert: pick.insert,
      segment: pick.segment
    }
  })
}

export const startEdgeRoutePoint = (input: {
  edgeId: EdgeId
  index: number
  pointerId: number
  startWorld: Point
  origin: Point
  point?: Point
}): EdgeRouteHandleState => ({
  kind: 'anchor',
  edgeId: input.edgeId,
  index: input.index,
  pointerId: input.pointerId,
  startWorld: input.startWorld,
  origin: input.origin,
  point: input.point ?? input.origin
})

export const startEdgeRouteSegment = (input: {
  edgeId: EdgeId
  index: number
  segmentIndex: number
  axis: 'x' | 'y'
  pointerId: number
  startWorld: Point
  origin: Point
  pathPoints: readonly Point[]
  baseRoutePoints: readonly Point[]
}): EdgeRouteHandleState => ({
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

export const readEdgeRouteSegmentView = (
  edge: Pick<EdgeRead, 'resolved' | 'item' | 'capability'>,
  edgeId: EdgeId
) => readEditableRouteView(edge, edgeId)

export const stepEdgeRoute = (input: {
  state: EdgeRouteHandleState
  edge: Edge
  pointerWorld: Point
}): {
  state: EdgeRouteHandleState
  draft?: EdgeRouteHandleDraft
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

export const commitEdgeRoute = (
  state: EdgeRouteHandleState
): EdgeRouteHandleCommit => ({
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
