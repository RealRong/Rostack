import type { Point } from '@whiteboard/core/types'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import {
  CANCEL,
  FINISH
} from '@whiteboard/editor/input/core/result'
import { createEdgeGesture } from '@whiteboard/editor/input/core/gesture'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import {
  commitEdgeMove,
  stepEdgeMove,
  type EdgeMoveState
} from '@whiteboard/editor/input/edge/move/start'

const readMoveGesture = (
  state: EdgeMoveState,
  patch?: ReturnType<typeof stepEdgeMove>['patch']
) => patch
  ? createEdgeGesture(
      'edge-move',
      {
        patches: [{
          id: state.edgeId,
          patch
        }]
      }
    )
  : null

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
