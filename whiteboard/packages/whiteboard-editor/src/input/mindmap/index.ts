import type {
  InteractionBinding
} from '../core/types'
import type { InteractionContext } from '../context'
import {
  startMindmapDrag,
} from './drag/start'
import { createMindmapSession } from './drag/session'

export const createMindmapInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'mindmap',
  start: (input) => {
    const state = startMindmapDrag({
      tool: ctx.read.tool.get(),
      pointer: input,
      mindmap: ctx.read.mindmap
    })

    return state
      ? createMindmapSession(ctx, state)
      : null
  }
})
