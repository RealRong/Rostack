import type { Point } from '@whiteboard/core/types'
import type { InteractionSession } from '../../runtime/interaction/types'
import {
  CANCEL,
  FINISH
} from '../../runtime/interaction/result'
import { createEdgeGesture } from '../../runtime/interaction/gesture'
import type { InteractionContext } from '../context'
import {
  commitEdgeMove,
  stepEdgeMove,
  type EdgeMoveState
} from '../../runtime/edge/move'

export const createEdgeBodyMoveSession = (
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

    if (!result.patch) {
      return
    }

    interaction!.gesture = createEdgeGesture(
      'edge-move',
      {
        patches: [{
          id: state.edgeId,
          patch: result.patch
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

      const commit = commitEdgeMove(state)
      if (commit) {
        ctx.write.edge.move(commit.edgeId, commit.delta)
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
