import { createValueStore } from '@whiteboard/engine'
import type { Viewport } from '@whiteboard/core/types'
import type { ViewportLimits } from '@whiteboard/core/geometry'
import type { DrawPreferences } from '../types/draw'
import type { EditorInsertCommands } from '../types/editor'
import type { EditorInputPolicy } from '../runtime/editor/types'
import { createDrawPreferencesState } from '../runtime/state/draw'
import { createViewport } from '../runtime/viewport'
import type {
  EditorDrawState,
  EditorHostViewport,
  EditorInputPolicyState,
  EditorInsertCommandRegistry
} from './types'

const mergeInputPolicy = ({
  current,
  patch
}: {
  current: EditorInputPolicy
  patch: Partial<EditorInputPolicy>
}): EditorInputPolicy => ({
  panEnabled: patch.panEnabled ?? current.panEnabled,
  wheelEnabled: patch.wheelEnabled ?? current.wheelEnabled,
  wheelSensitivity: patch.wheelSensitivity ?? current.wheelSensitivity
})

export const createEditorHostViewport = ({
  initialViewport,
  limits
}: {
  initialViewport: Viewport
  limits?: ViewportLimits
}): EditorHostViewport => createViewport({
  initialViewport,
  limits
})

export const createEditorInputPolicyState = (
  initialPolicy: EditorInputPolicy
): EditorInputPolicyState => {
  const store = createValueStore<EditorInputPolicy>({
    panEnabled: initialPolicy.panEnabled,
    wheelEnabled: initialPolicy.wheelEnabled,
    wheelSensitivity: initialPolicy.wheelSensitivity
  })

  return {
    store,
    set: (policy) => {
      store.set({
        panEnabled: policy.panEnabled,
        wheelEnabled: policy.wheelEnabled,
        wheelSensitivity: policy.wheelSensitivity
      })
    },
    patch: (patch) => {
      store.set(
        mergeInputPolicy({
          current: store.get(),
          patch
        })
      )
    }
  }
}

export const createEditorDrawState = (
  initialPreferences: DrawPreferences
): EditorDrawState => {
  const state = createDrawPreferencesState(initialPreferences)

  return {
    preferences: state.store,
    commands: state.commands
  }
}

export const createEditorInsertCommandRegistry = (): EditorInsertCommandRegistry => {
  let current: EditorInsertCommands | null = null

  return {
    get: () => current,
    set: (commands) => {
      current = commands
    },
    clear: () => {
      current = null
    }
  }
}
