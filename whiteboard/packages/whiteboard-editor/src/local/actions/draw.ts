import type { DrawCommands } from '@whiteboard/editor/types/commands'
import type { Tool } from '@whiteboard/editor/types/tool'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '@whiteboard/editor/local/draw'
import type { DrawStateStore } from '@whiteboard/editor/local/draw/runtime'

type DrawStateHost = {
  tool: {
    get: () => Tool
  }
  draw: DrawStateStore
}

export type LocalDrawActions = DrawCommands

export const createLocalDrawActions = ({
  state
}: {
  state: DrawStateHost
}): LocalDrawActions => ({
  set: (nextState) => {
    state.draw.commands.set(nextState)
  },
  slot: (slot) => {
    const tool = state.tool.get()
    const brush = tool.type === 'draw' && hasDrawBrush(tool.mode)
      ? tool.mode
      : DEFAULT_DRAW_BRUSH
    state.draw.commands.slot(brush, slot)
  },
  patch: (patch) => {
    const tool = state.tool.get()
    const brush = tool.type === 'draw' && hasDrawBrush(tool.mode)
      ? tool.mode
      : DEFAULT_DRAW_BRUSH
    const currentSlot = state.draw.store.get()[brush].slot
    state.draw.commands.patch(brush, currentSlot, patch)
  }
})
