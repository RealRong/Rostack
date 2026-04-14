import type {
  InteractionBinding
} from '@whiteboard/editor/input/core/types'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import {
  createStrokeSession,
  startStrokeState
} from '@whiteboard/editor/input/draw/stroke/session'
import { startEraseState } from '@whiteboard/editor/input/draw/erase/start'
import {
  createEraseSession
} from '@whiteboard/editor/input/draw/erase/session'

export const createDrawInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'draw',
  start: (input) => {
    const tool = ctx.query.tool.get()

    if (tool.type !== 'draw') {
      return null
    }

    if (tool.mode === 'eraser') {
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
