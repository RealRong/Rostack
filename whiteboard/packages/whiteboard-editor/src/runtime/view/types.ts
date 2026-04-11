import type { Viewport } from '@whiteboard/core/types'
import type { ViewportInputRuntime } from '../viewport'
import type {
  EditorDrawActions,
  EditorViewActions,
  EditorViewportActions
} from '../../types/editor'

export type ViewCommands = {
  viewport: EditorViewportActions
    & Pick<ViewportInputRuntime, 'panScreenBy' | 'wheel'>
    & {
      set: (next: Viewport) => void
    }
  pointer: EditorViewActions['pointer']
  space: EditorViewActions['space']
  draw: EditorDrawActions
}
