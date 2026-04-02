import type { PropertyEditIntent } from '@/react/page/interaction'
import type { ViewFieldRef } from '@/engine/projection/view'

export type { ViewFieldRef } from '@/engine/projection/view'

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

export interface PropertyEditSession extends OpenValueEditorInput { }

export interface PropertyEditApi {
  open(input: OpenValueEditorInput): boolean
  close(options?: CloseValueEditorOptions): void
}
