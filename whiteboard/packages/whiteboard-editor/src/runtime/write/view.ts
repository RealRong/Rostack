import type { PointerSample } from '../../types/input'
import type { EditorViewWrite } from '../../types/editor'
import type { EditorViewportRuntime } from '../editor/types'
import type { RuntimeStateController } from '../state'

export const createViewWrite = ({
  runtime,
  viewport
}: {
  runtime: RuntimeStateController
  viewport: EditorViewportRuntime
}): EditorViewWrite => ({
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
      const slot = runtime.state.draw.store.get()[kind].slot
      runtime.state.draw.commands.patch(kind, slot, patch)
    }
  }
})
