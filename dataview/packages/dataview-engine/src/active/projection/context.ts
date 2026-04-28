import type {
  View,
  ViewId
} from '@dataview/core/types'
import type {
  ActivePhaseName,
  ActiveProjectionInput,
  ActiveProjectionWorking
} from './types'

export type ActiveProjectionContext<TScope> = {
  input: ActiveProjectionInput
  state: ActiveProjectionWorking
  revision: number
  scope: TScope
}

export type ActiveProjectionPhase<
  TName extends ActivePhaseName
> = {
  after?: readonly ActivePhaseName[]
  scope?: unknown
  run: (context: ActiveProjectionContext<unknown>) => {
    action?: 'reuse' | 'sync' | 'rebuild'
    metrics?: unknown
    emit?: Record<string, unknown>
  }
}

export const readActiveView = (
  input: ActiveProjectionInput
): {
  activeViewId?: ViewId
  view?: View
} => ({
  activeViewId: input.read.reader.views.activeId(),
  view: input.read.reader.views.active()
})
