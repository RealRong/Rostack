import type {
  ViewportRead,
  ViewportRuntime
} from '../viewport'

export type EditorInputPolicy = {
  panEnabled: boolean
  wheelEnabled: boolean
  wheelSensitivity: number
}

export type EditorViewportRuntime =
  ViewportRead & Pick<ViewportRuntime, 'input' | 'setRect' | 'setLimits'>
