import type { PointerSample } from '../../types/input'
import type { EditorViewWrite } from '../../types/editor'
import type { RuntimeStateController } from '../state'
import type { EditorHost } from '../../host/types'

export const createViewWrite = ({
  runtime,
  host
}: {
  runtime: RuntimeStateController
  host: Pick<EditorHost, 'viewport' | 'inputPolicy' | 'draw'>
}): EditorViewWrite => ({
  viewport: {
    ...host.viewport.commands,
    ...host.viewport.input,
    setRect: host.viewport.setRect,
    setLimits: host.viewport.setLimits
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
      host.inputPolicy.set(policy)
    },
    patch: (patch) => {
      host.inputPolicy.patch(patch)
    }
  },
  draw: host.draw.commands
})
