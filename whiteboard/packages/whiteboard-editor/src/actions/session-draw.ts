import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '@whiteboard/editor/schema/draw-mode'
import type { DrawActions } from '@whiteboard/editor/actions/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'

const readActiveDrawBrush = (
  context: EditorActionContext
) => {
  const tool = context.stores.tool.get()
  return tool.type === 'draw' && hasDrawBrush(tool.mode)
    ? tool.mode
    : DEFAULT_DRAW_BRUSH
}

export const createSessionDrawActions = (
  context: EditorActionContext
): DrawActions => ({
  set: (drawState) => {
    context.state.write(({
      writer
    }) => {
      writer.draw.set(drawState)
    })
  },
  slot: (slot) => {
    context.state.write(({
      writer
    }) => {
      writer.draw.slot(readActiveDrawBrush(context), slot)
    })
  },
  patch: (patch) => {
    context.state.write(({
      writer
    }) => {
      writer.draw.patch(patch)
    })
  }
})
