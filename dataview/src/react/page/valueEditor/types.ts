import type { PropertyEditIntent } from '@dataview/react/interaction'
import type { ViewFieldRef } from '@dataview/engine/projection/view'

export type { ViewFieldRef } from '@dataview/engine/projection/view'

export interface ValueEditorAnchor {
  x: number
  y: number
  width: number
}

export interface CloseValueEditorOptions {
  silent?: boolean
}

export type ValueEditorResult =
  | {
    kind: 'commit'
    intent: PropertyEditIntent
  }
  | {
    kind: 'cancel'
  }
  | {
    kind: 'dismiss'
  }

export interface OpenValueEditorInput {
  field: ViewFieldRef
  anchor: ValueEditorAnchor
  seedDraft?: string
  onResolve?: (result: ValueEditorResult) => void
}

export interface ValueEditorSession extends OpenValueEditorInput { }

export interface ValueEditorApi {
  open(input: OpenValueEditorInput): boolean
  close(options?: CloseValueEditorOptions): void
}

export type PropertyEditSession = ValueEditorSession
export type PropertyEditApi = ValueEditorApi
