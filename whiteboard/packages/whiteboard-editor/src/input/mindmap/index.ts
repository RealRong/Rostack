import type {
  InteractionBinding
} from '#whiteboard-editor/input/core/types'
import type { InteractionContext } from '#whiteboard-editor/input/context'
import {
  startMindmapDrag,
} from '#whiteboard-editor/input/mindmap/drag/start'
import { createMindmapSession } from '#whiteboard-editor/input/mindmap/drag/session'

export const createMindmapInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'mindmap',
  start: (input) => {
    const state = startMindmapDrag({
      tool: ctx.query.tool.get(),
      pointer: input,
      mindmap: ctx.query.mindmap
    })

    return state
      ? createMindmapSession(ctx, state)
      : null
  }
})
