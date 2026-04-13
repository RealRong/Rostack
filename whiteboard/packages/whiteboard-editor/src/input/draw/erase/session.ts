import { FINISH } from '../../core/result'
import type {
  InteractionSession
} from '../../core/types'
import type { InteractionContext } from '../../context'
import {
  commitEraseState,
  startEraseState,
  stepEraseState,
  type EraseState
} from './start'

export const createEraseSession = (
  ctx: InteractionContext,
  initial: EraseState
): InteractionSession => {
  let state = initial

  if (state.ids.length > 0) {
    ctx.write.preview.draw.setHidden(state.ids)
  }

  const step = (
    input: Parameters<typeof stepEraseState>[2]
  ) => {
    const nextState = stepEraseState(ctx, state, input)
    if (nextState.ids !== state.ids) {
      ctx.write.preview.draw.setHidden(nextState.ids)
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
      ctx.write.preview.draw.clear()
    }
  }
}
