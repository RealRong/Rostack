import type {
  InteractionBinding
} from '../../runtime/interaction/types'
import type { InteractionContext } from '../context'
import {
  createStrokeSession,
  startStrokeState
} from './stroke'
import {
  createEraseSession,
  startEraseState
} from './erase'

export const createDrawInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'draw',
  start: (input) => {
    const tool = ctx.read.tool.get()

    if (tool.type !== 'draw') {
      return null
    }

    if (tool.kind === 'eraser') {
      const state = startEraseState(ctx, input)
      return state
        ? createEraseSession(ctx, state)
        : null
    }

    const state = startStrokeState(ctx, input)
    return state
      ? createStrokeSession(ctx, state)
      : null
  }
})
