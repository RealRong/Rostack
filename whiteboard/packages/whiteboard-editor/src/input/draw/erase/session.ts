import { FINISH } from '#whiteboard-editor/input/core/result'
import type {
  InteractionSession
} from '#whiteboard-editor/input/core/types'
import type { InteractionContext } from '#whiteboard-editor/input/context'
import {
  commitEraseState,
  startEraseState,
  stepEraseState,
  type EraseState
} from '#whiteboard-editor/input/draw/erase/start'

export const createEraseSession = (
  ctx: InteractionContext,
  initial: EraseState
): InteractionSession => {
  let state = initial

  if (state.ids.length > 0) {
    ctx.local.feedback.draw.setHidden(state.ids)
  }

  const step = (
    input: Parameters<typeof stepEraseState>[2]
  ) => {
    const nextState = stepEraseState(ctx, state, input)
    if (nextState.ids !== state.ids) {
      ctx.local.feedback.draw.setHidden(nextState.ids)
    }
    state = nextState
  }

  return {
    mode: 'draw',
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input)
      commitEraseState(ctx, state)
      return FINISH
    },
    cleanup: () => {
      ctx.local.feedback.draw.clear()
    }
  }
}
