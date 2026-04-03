import { isPointEqual } from '../geometry'
import type { EdgeHandle } from '../types/edge'
import type { Edge, EdgeId, EdgePatch, Point } from '../types'
import { moveRoutePoint } from './commands'

export type RouteHandleTarget =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'insert'
      edgeId: EdgeId
      index: number
      point: Point
    }

export type RouteHandleState = {
  edgeId: EdgeId
  index: number
  pointerId: number
  startWorld: Point
  origin: Point
  point: Point
}

export type RouteHandleDraft = {
  patch?: EdgePatch
  activeRouteIndex: number
}

export type RouteHandleCommit = {
  edgeId: EdgeId
  index: number
  point?: Point
}

export const resolveRouteHandleTarget = (input: {
  edgeId: EdgeId
  handles: readonly EdgeHandle[]
  pick: {
    index?: number
    insert?: number
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

  const insertIndex = input.pick.insert ?? 0
  const handle = input.handles.find((entry) => (
    entry.kind === 'insert'
    && entry.insertIndex === insertIndex
  ))

  return handle?.kind === 'insert'
    ? {
        kind: 'insert',
        edgeId: input.edgeId,
        index: handle.insertIndex,
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
}): RouteHandleState => ({
  edgeId: input.edgeId,
  index: input.index,
  pointerId: input.pointerId,
  startWorld: input.startWorld,
  origin: input.origin,
  point: input.point ?? input.origin
})

export const stepRouteHandleState = (input: {
  state: RouteHandleState
  edge: Edge
  pointerWorld: Point
}): {
  state: RouteHandleState
  draft?: RouteHandleDraft
} => {
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
    point: isPointEqual(state.point, state.origin)
      ? undefined
      : state.point
  })
