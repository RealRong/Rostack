import type { Viewport } from '@whiteboard/core/types'
import type { PointerSample } from '../../types/input'
import type {
  DrawCommands,
  ViewPointerActions,
  ViewSpaceActions,
  ViewportActions
} from '../../types/commands'
import type { EditorStateController } from '../state'
import type { EditorViewportRuntime } from '../editor/types'
import type { ViewportInputRuntime } from '../viewport'

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
    set: (preferences) => {
      runtime.state.draw.commands.set(preferences)
    },
    slot: (slot) => {
      const tool = runtime.state.tool.get()
      const kind = tool.type === 'draw' && tool.kind !== 'eraser'
        ? tool.kind
        : 'pen'
      runtime.state.draw.commands.slot(kind, slot)
    },
    patch: (patch) => {
      const tool = runtime.state.tool.get()
      const kind = tool.type === 'draw' && tool.kind !== 'eraser'
        ? tool.kind
        : 'pen'
      const currentSlot = runtime.state.draw.store.get()[kind].slot
      runtime.state.draw.commands.patch(kind, currentSlot, patch)
    }
  }
})
