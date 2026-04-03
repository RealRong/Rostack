import type { ViewId } from '@dataview/core/contracts'
import type { AppearanceId } from '@dataview/react/currentView'
import type { ValueStore } from '@dataview/runtime/store'

export interface InlineSessionTarget {
  viewId: ViewId
  appearanceId: AppearanceId
}

export interface InlineSessionApi {
  store: ValueStore<InlineSessionTarget | null>
  enter(target: InlineSessionTarget): void
  exit(): void
  isActive(target: InlineSessionTarget): boolean
}
