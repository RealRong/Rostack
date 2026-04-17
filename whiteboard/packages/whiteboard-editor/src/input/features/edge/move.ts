import { isPointEqual } from '@whiteboard/core/geometry'
import { moveEdge } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type {
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import {
  CANCEL,
  FINISH
} from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { InteractionContext } from '@whiteboard/editor/input/core/context'
import type { EdgePresentationRead } from '@whiteboard/editor/query/edge/read'

export type EdgeMoveState = {
  edgeId: EdgeId
  pointerId: number
  edge?: Edge
  start: Point
  delta: Point
}

const ZERO_POINT: Point = {
  x: 0,
  y: 0
}

const readEdgeMovePatch = (
  state: EdgeMoveState
) => state.edge && !isPointEqual(state.delta, ZERO_POINT)
  ? moveEdge(state.edge, state.delta)
  : undefined

const readMovableEdge = (
  edge: Pick<EdgePresentationRead, 'item' | 'capability'>,
  edgeId: EdgeId
) => {
  const item = edge.item.get(edgeId)

  return item && edge.capability(item.edge).move
    ? item.edge
    : undefined
}

export const startEdgeMove = (input: {
  edge: Pick<EdgePresentationRead, 'item' | 'capability'>
  edgeId: EdgeId
  pointerId: number
  start: Point
}): EdgeMoveState => ({
  edgeId: input.edgeId,
  pointerId: input.pointerId,
  edge: readMovableEdge(input.edge, input.edgeId),
  start: input.start,
  delta: { x: 0, y: 0 }
})

export const stepEdgeMove = (
  state: EdgeMoveState,
  world: Point
): {
  state: EdgeMoveState
  patch?: ReturnType<typeof moveEdge>
  cancel?: true
} => {
  if (!state.edge) {
    return {
      state,
      cancel: true
    }
  }

  const delta = {
    x: world.x - state.start.x,
    y: world.y - state.start.y
  }
  if (isPointEqual(delta, state.delta)) {
    return {
      state,
      patch: readEdgeMovePatch(state)
    }
  }

  const nextState = {
    ...state,
    delta
  }

  return {
    state: nextState,
    patch: readEdgeMovePatch(nextState)
  }
}

const commitEdgeMove = (
  state: EdgeMoveState
): {
  edgeId: EdgeId
  delta: Point
} | undefined => (
  !isPointEqual(state.delta, ZERO_POINT)
    ? {
        edgeId: state.edgeId,
        delta: state.delta
      }
    : undefined
)

const readMoveGesture = (
  state: EdgeMoveState,
  patch?: ReturnType<typeof stepEdgeMove>['patch']
) => patch
  ? createGesture(
      'edge-move',
      {
        edgePatches: [{
          id: state.edgeId,
          patch
        }]
      }
    )
  : null

export const createEdgeMoveSession = (
  ctx: InteractionContext,
  initial: EdgeMoveState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    world: Point
  ) => {
    const result = stepEdgeMove(state, world)
    state = result.state

    if (result.cancel) {
      return CANCEL
    }

    interaction!.gesture = readMoveGesture(state, result.patch)
  }

  interaction = {
    mode: 'edge-drag',
    pointerId: state.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => step(ctx.query.viewport.pointer(pointer).world)
    },
    move: (input) => {
      const transition = step(input.world)
      if (transition) {
        return transition
      }
    },
    up: (input) => {
      const transition = step(input.world)
      if (transition) {
        return transition
      }

      const commit = commitEdgeMove(state)
      if (commit) {
        ctx.command.edge.move({
          ids: [commit.edgeId],
          delta: commit.delta
        })
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
