import type { ViewId } from '@dataview/core/contracts'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import type { ValueStore } from '@dataview/runtime/store'

export interface InlineSessionTarget {
  viewId: ViewId
  appearanceId: AppearanceId
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
  enter(target: InlineSessionTarget): void
  exit(options?: {
    reason?: InlineSessionExitReason
  }): void
  isActive(target: InlineSessionTarget): boolean
  onExit(listener: (event: InlineSessionExitEvent) => void): () => void
}
