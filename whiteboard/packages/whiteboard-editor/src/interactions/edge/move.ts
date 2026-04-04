import { isPointEqual } from '@whiteboard/core/geometry'
import { moveEdge } from '@whiteboard/core/edge'
import type {
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type {
  InteractionSession
} from '../../runtime/interaction/types'
import {
  CANCEL,
  FINISH
} from '../../runtime/interaction/result'
import { createEdgeGesture } from '../../runtime/interaction/gesture'
import type { InteractionContext } from '../context'

type EdgeBodyMoveState = {
  edgeId: EdgeId
  pointerId: number
  start: Point
  delta: Point
}

const readMovableEdge = (
  ctx: InteractionContext,
  edgeId: EdgeId
) => {
  const item = ctx.read.edge.item.get(edgeId)

  return item && ctx.read.edge.capability(item.edge).move
    ? item.edge
    : undefined
}

export const createEdgeBodyMoveSession = (
  ctx: InteractionContext,
  input: {
    edgeId: EdgeId
    pointerId: number
    start: Point
  }
): InteractionSession => {
  let state: EdgeBodyMoveState = {
    edgeId: input.edgeId,
    pointerId: input.pointerId,
    start: input.start,
    delta: { x: 0, y: 0 }
  }
  let interaction = null as InteractionSession | null

  const step = (
    world: Point
  ) => {
    const edge = readMovableEdge(ctx, state.edgeId)
    if (!edge) {
      return CANCEL
    }

    const delta = {
      x: world.x - state.start.x,
      y: world.y - state.start.y
    }
    if (isPointEqual(delta, state.delta)) {
      return
    }

    const patch = moveEdge(edge, delta)
    state = {
      ...state,
      delta
    }

    interaction!.gesture = createEdgeGesture(
      'edge-move',
      {
        patches: [{
          id: state.edgeId,
          patch
        }]
      }
    )
  }

  interaction = {
    mode: 'edge-drag',
    pointerId: state.pointerId,
    gesture: null,
    autoPan: {
      frame: (pointer) => step(ctx.read.viewport.pointer(pointer).world)
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

      if (!isPointEqual(state.delta, { x: 0, y: 0 })) {
        ctx.write.document.edge.move(state.edgeId, state.delta)
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
