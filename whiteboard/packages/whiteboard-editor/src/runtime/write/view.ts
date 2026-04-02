import { isDrawBrushKind } from '../../tool/model'
import { readDrawSlot } from '../../draw/model'
import type { PointerSample } from '../../types/input'
import type { EditorViewWrite } from '../../types/editor'
import type { RuntimeStateController } from '../state'

const mergeInputPolicy = (input: {
  current: {
    panEnabled: boolean
    wheelEnabled: boolean
    wheelSensitivity: number
  }
  patch: Partial<{
    panEnabled: boolean
    wheelEnabled: boolean
    wheelSensitivity: number
  }>
}) => ({
  panEnabled: input.patch.panEnabled ?? input.current.panEnabled,
  wheelEnabled: input.patch.wheelEnabled ?? input.current.wheelEnabled,
  wheelSensitivity: input.patch.wheelSensitivity ?? input.current.wheelSensitivity
})

export const createViewWrite = ({
  runtime
}: {
  runtime: RuntimeStateController
}): EditorViewWrite => ({
  viewport: {
    ...runtime.state.viewport.commands,
    ...runtime.state.viewport.input,
    setRect: runtime.state.viewport.setRect,
    setLimits: runtime.state.viewport.setLimits
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
  inputPolicy: {
    set: (policy) => {
      runtime.state.inputPolicy.set(policy)
    },
    patch: (patch) => {
      runtime.state.inputPolicy.set(
        mergeInputPolicy({
          current: runtime.state.inputPolicy.get(),
          patch
        })
      )
    }
  },
  draw: {
    slot: (slot) => {
      const current = runtime.state.tool.get()
      if (current.type !== 'draw' || !isDrawBrushKind(current.kind)) {
        return
      }

      runtime.state.drawPreferences.commands.slot(current.kind, slot)
    },
    patch: (patch) => {
      const current = runtime.state.tool.get()
      if (current.type !== 'draw' || !isDrawBrushKind(current.kind)) {
        return
      }

      runtime.state.drawPreferences.commands.patch(
        current.kind,
        readDrawSlot(runtime.state.drawPreferences.store.get(), current.kind),
        patch
      )
    }
  }
})
