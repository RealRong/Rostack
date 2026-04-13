import type { DrawCommands } from '../../types/commands'
import type { Tool } from '../../types/tool'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '../draw'
import type { DrawStateStore } from '../draw/runtime'

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
