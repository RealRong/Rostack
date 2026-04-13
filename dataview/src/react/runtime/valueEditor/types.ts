import type { EditorSubmitTrigger } from '@dataview/react/interaction'
import type { ViewFieldRef } from '@dataview/engine'
import type { ReadStore, ValueStore } from '@shared/core'

export type { ViewFieldRef } from '@dataview/engine'

export interface ValueEditorAnchor {
  x: number
  y: number
  width: number
}

export interface CloseValueEditorOptions {
  silent?: boolean
}

export type ValueEditorCloseAction =
  | {
      kind: 'focus-owner'
    }
  | {
      kind: 'move-next-item'
    }
  | {
      kind: 'move-next-field'
    }
  | {
      kind: 'move-previous-field'
    }

export interface ValueEditorSessionPolicy {
  resolveOnCommit: (trigger: EditorSubmitTrigger) => ValueEditorCloseAction
  applyCloseAction: (action: ValueEditorCloseAction) => boolean
  onCancel?: () => void
  onDismiss?: () => void
}

export type ValueEditorResult =
  | {
      kind: 'commit'
      trigger: EditorSubmitTrigger
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
  policy: ValueEditorSessionPolicy
  seedDraft?: string
  onResolve?: (result: ValueEditorResult) => void
}

export interface ValueEditorSession extends OpenValueEditorInput { }

export interface ValueEditorApi {
  open(input: OpenValueEditorInput): boolean
  close(options?: CloseValueEditorOptions): void
}

export interface ValueEditorController extends ValueEditorApi {
  store: ValueStore<ValueEditorSession | null>
  openStore: ReadStore<boolean>
}
