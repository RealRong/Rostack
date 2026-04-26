import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import {
  type ProjectionSpec
} from '@shared/projection'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActiveProjectionCapture,
  ActivePhaseScopeMap,
  ActiveProjectionInput,
  ActiveProjectionWorking,
  ScopeValue
} from '../contracts/projection'

type ActiveProjectionSurface = Record<never, never>

type ActiveProjectionSpec = ProjectionSpec<
  ActiveProjectionInput,
  ActiveProjectionWorking,
  {},
  ActiveProjectionSurface,
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActivePhaseMetrics,
  ActiveProjectionCapture
>

export type ActiveProjectionContext<TScope> = {
  input: ActiveProjectionInput
  state: ActiveProjectionWorking
  revision: number
  scope: TScope
}

export type ActiveProjectionPhase<
  TName extends ActivePhaseName
> = ActiveProjectionSpec['phases'][TName]

export const readActiveView = (
  input: ActiveProjectionInput
): {
  activeViewId?: ViewId
  view?: View
} => ({
  activeViewId: input.read.reader.views.activeId(),
  view: input.read.reader.views.active()
})
