import type { Viewport } from '@whiteboard/core/types'
import type { PointerSample } from '../../types/input'
import type {
  ViewPointerActions,
  ViewSpaceActions,
  ViewportActions
} from '../../types/commands'
import type { ViewportInputRuntime, ViewportRuntime } from '../viewport/runtime'
import type { EditorLocalState } from '../runtime'

export type LocalViewportActions = {
  viewport: ViewportActions
    & Pick<ViewportInputRuntime, 'panScreenBy' | 'wheel'>
    & {
      set: (next: Viewport) => void
    }
  pointer: ViewPointerActions
  space: ViewSpaceActions
}

export const createLocalViewportActions = ({
  state,
  viewport
}: {
  state: Pick<EditorLocalState, 'pointer' | 'space'>
  viewport: ViewportRuntime
}): LocalViewportActions => ({
  viewport: {
    ...viewport.commands,
    ...viewport.input,
    setRect: viewport.setRect,
    setLimits: viewport.setLimits
  },
  pointer: {
    set: (sample: PointerSample) => {
      state.pointer.set(sample)
    },
    clear: () => {
      state.pointer.set(null)
    }
  },
  space: {
    set: (value) => {
      state.space.set(value)
    }
  }
})
