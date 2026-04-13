import {
  resolveEdgeRouteHandleTarget,
  moveElbowRouteSegment,
  moveRoutePoint,
  areRoutePointsEqual,
  type EdgeView as CoreEdgeView,
  type EdgeRouteHandleTarget
} from '@whiteboard/core/edge'
import { isPointEqual } from '@whiteboard/core/geometry'
import type { Edge, EdgeId, EdgePatch, Point } from '@whiteboard/core/types'
import type { PointerDownInput } from '../../../types/input'
import type { EdgeRead } from '../../../query/edge/read'

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

export type EdgeRouteStart =
  | {
      kind: 'insert'
      edgeId: EdgeId
      pointerId: number
      startWorld: Point
      origin: Point
      point: Point
    }
  | {
      kind: 'remove'
      edgeId: EdgeId
      index: number
    }
  | {
      kind: 'session'
      state: EdgeRouteHandleState
    }

export type EdgeRouteCommit =
  | {
      kind: 'move-point'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'update-route'
      edgeId: EdgeId
      route: EdgePatch['route']
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
): CoreEdgeView | undefined => {
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

const startEdgeRouteSegment = (input: {
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

export const startEdgeRoute = (input: {
  edge: Pick<EdgeRead, 'resolved' | 'item' | 'capability'>
  pointer: PointerDownInput
}): EdgeRouteStart | undefined => {
  const target = resolveEdgeRoutePickTarget(
    input.edge,
    input.pointer.pick
  )
  if (!target) {
    return undefined
  }

  if (target.kind === 'anchor' && input.pointer.detail >= 2) {
    return {
      kind: 'remove',
      edgeId: target.edgeId,
      index: target.index
    }
  }

  if (target.kind === 'anchor') {
    return {
      kind: 'session',
      state: startEdgeRoutePoint({
        edgeId: target.edgeId,
        index: target.index,
        pointerId: input.pointer.pointerId,
        startWorld: input.pointer.world,
        origin: target.point
      })
    }
  }

  const item = input.edge.item.get(target.edgeId)
  const view = readEditableRouteView(input.edge, target.edgeId)

  if (item?.edge.type === 'elbow' && view) {
    return {
      kind: 'session',
      state: startEdgeRouteSegment({
        edgeId: target.edgeId,
        index: target.index,
        segmentIndex: target.segmentIndex,
        axis: target.axis,
        pointerId: input.pointer.pointerId,
        startWorld: input.pointer.world,
        origin: target.point,
        pathPoints: view.path.points,
        baseRoutePoints:
          item.edge.route?.kind === 'manual'
            ? item.edge.route.points
            : []
      })
    }
  }

  return {
    kind: 'insert',
    edgeId: target.edgeId,
    pointerId: input.pointer.pointerId,
    startWorld: input.pointer.world,
    origin: target.point,
    point: input.pointer.world
  }
}

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
): EdgeRouteCommit | undefined => {
  if (state.kind === 'anchor') {
    return isPointEqual(state.point, state.origin)
      ? undefined
      : {
          kind: 'move-point',
          edgeId: state.edgeId,
          index: state.index,
          point: state.point
        }
  }

  if (areRoutePointsEqual(state.routePoints, state.baseRoutePoints)) {
    return undefined
  }

  return {
    kind: 'update-route',
    edgeId: state.edgeId,
    route:
      state.routePoints.length > 0
        ? {
            kind: 'manual',
            points: [...state.routePoints]
          }
        : {
            kind: 'auto'
          }
  }
}
