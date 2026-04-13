import type { Viewport } from '@whiteboard/core/types'
import type { PointerSample } from '../types/input'
import type {
  DrawCommands,
  ViewPointerActions,
  ViewSpaceActions,
  ViewportActions
} from '../types/commands'
import type { EditorStateController } from '../state'
import type { EditorViewportRuntime } from '../editor/types'
import type { ViewportInputRuntime } from '../editor/viewport'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '../model/draw'

export type ViewCommands = {
  viewport: ViewportActions
    & Pick<ViewportInputRuntime, 'panScreenBy' | 'wheel'>
    & {
      set: (next: Viewport) => void
    }
  pointer: ViewPointerActions
  space: ViewSpaceActions
  draw: DrawCommands
}

export const createViewCommands = ({
  runtime,
  viewport
}: {
  runtime: EditorStateController
  viewport: EditorViewportRuntime
}): ViewCommands => ({
  viewport: {
    ...viewport.commands,
    ...viewport.input,
    setRect: viewport.setRect,
    setLimits: viewport.setLimits
  },
  pointer: {
    set: (sample: PointerSample) => {
      runtime.state.pointer.set(sample)
    },
    clear: () => {
      runtime.state.pointer.set(null)
    }
  },
  space: {
    set: (value) => {
      runtime.state.space.set(value)
    }
  },
  draw: {
    set: (state) => {
      runtime.state.draw.commands.set(state)
    },
    slot: (slot) => {
      const tool = runtime.state.tool.get()
      const brush = tool.type === 'draw' && hasDrawBrush(tool.mode)
        ? tool.mode
        : DEFAULT_DRAW_BRUSH
      runtime.state.draw.commands.slot(brush, slot)
    },
    patch: (patch) => {
      const tool = runtime.state.tool.get()
      const brush = tool.type === 'draw' && hasDrawBrush(tool.mode)
        ? tool.mode
        : DEFAULT_DRAW_BRUSH
      const currentSlot = runtime.state.draw.store.get()[brush].slot
      runtime.state.draw.commands.patch(brush, currentSlot, patch)
    }
  }
})
