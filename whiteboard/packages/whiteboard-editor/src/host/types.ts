import type { ReadStore } from '@whiteboard/engine'
import type { DrawCommands, DrawPreferences } from '../types/draw'
import type { EditorInsertCommands } from '../types/editor'
import type { EditorInputPolicy } from '../runtime/editor/types'
import type { ViewportRuntime } from '../runtime/viewport'

export type EditorHostViewport = ViewportRuntime

export type EditorInputPolicyState = {
  store: ReadStore<EditorInputPolicy>
  set: (policy: EditorInputPolicy) => void
  patch: (patch: Partial<EditorInputPolicy>) => void
}

export type EditorDrawState = {
  preferences: ReadStore<DrawPreferences>
  commands: DrawCommands
}

export type EditorInsertCommandRegistry = {
  get: () => EditorInsertCommands | null
  set: (commands: EditorInsertCommands) => void
  clear: () => void
}

export type EditorHost = {
  viewport: EditorHostViewport
  inputPolicy: EditorInputPolicyState
  draw: EditorDrawState
  insert: Pick<EditorInsertCommandRegistry, 'get'>
}
