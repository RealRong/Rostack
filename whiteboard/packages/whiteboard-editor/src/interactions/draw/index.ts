import type {
  InteractionBinding
} from '../../runtime/interaction'
import type { InteractionCtx } from '../../runtime/interaction/ctx'
import {
  createStrokeInteractionSession,
  startStrokeSession,
} from './stroke'
import {
  createEraseInteractionSession,
  startEraseSession,
} from './erase'

type DrawInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write'
>

export const createDrawInteraction = (
  ctx: DrawInteractionCtx
): InteractionBinding => ({
  key: 'draw',
  start: (input) => {
    const tool = ctx.read.tool.get()

    if (tool.type !== 'draw') {
      return null
    }

    if (tool.kind === 'eraser') {
      const session = startEraseSession(ctx, input)
      return session
        ? createEraseInteractionSession(ctx, session)
        : null
    }

    const session = startStrokeSession(ctx, input)
    return session
      ? createStrokeInteractionSession(ctx, session)
      : null
  }
})
