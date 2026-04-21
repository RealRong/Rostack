import type { ViewId } from '@dataview/core/contracts'
import type { ItemId } from '@dataview/engine'
import { store } from '@shared/core'


export interface InlineSessionTarget {
  viewId: ViewId
  itemId: ItemId
}

export type InlineSessionExitReason =
  | 'submit'
  | 'escape'
  | 'outside'
  | 'selection'
  | 'view-change'
  | 'programmatic'

export interface InlineSessionExitEvent {
  target: InlineSessionTarget
  reason: InlineSessionExitReason
}

export interface InlineSessionApi {
  store: store.ValueStore<InlineSessionTarget | null>
  editing: store.KeyedReadStore<string, boolean>
  key(target: InlineSessionTarget): string
  enter(target: InlineSessionTarget): void
  exit(options?: {
    reason?: InlineSessionExitReason
  }): void
  isActive(target: InlineSessionTarget): boolean
  onExit(listener: (event: InlineSessionExitEvent) => void): () => void
}
