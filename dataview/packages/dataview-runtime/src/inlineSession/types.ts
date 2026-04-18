import type { ViewId } from '@dataview/core/contracts'
import type { ItemId } from '@dataview/engine'
import type {
  KeyedReadStore,
  ValueStore
} from '@shared/core'

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
  store: ValueStore<InlineSessionTarget | null>
  editing: KeyedReadStore<string, boolean>
  key(target: InlineSessionTarget): string
  enter(target: InlineSessionTarget): void
  exit(options?: {
    reason?: InlineSessionExitReason
  }): void
  isActive(target: InlineSessionTarget): boolean
  onExit(listener: (event: InlineSessionExitEvent) => void): () => void
}
