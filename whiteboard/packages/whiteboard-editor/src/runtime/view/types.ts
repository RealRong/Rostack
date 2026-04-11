import type { Viewport } from '@whiteboard/core/types'
import type { ViewportInputRuntime } from '../viewport'
import type {
  DrawCommands,
  ViewPointerActions,
  ViewSpaceActions,
  ViewportActions
} from '../../types/commands'

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
