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
  ActiveProjectorInput,
  ActiveProjectorWorking,
  ScopeValue
} from '../contracts/projector'

type ActiveProjectorSurface = {}

type ActiveProjectionSpec = ProjectionSpec<
  ActiveProjectorInput,
  ActiveProjectorWorking,
  {},
  ActiveProjectorSurface,
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActivePhaseMetrics,
  ActiveProjectionCapture
>

export type ActiveProjectorContext<TScope> = {
  input: ActiveProjectorInput
  state: ActiveProjectorWorking
  revision: number
  scope: TScope
}

export type ActiveProjectorPhase<
  TName extends ActivePhaseName
> = ActiveProjectionSpec['phases'][TName]

export const defineActiveProjectorPhase = <
  TName extends ActivePhaseName
>(
  phase: ActiveProjectorPhase<TName>
): ActiveProjectorPhase<TName> => phase

export const readActiveView = (
  input: ActiveProjectorInput
): {
  activeViewId?: ViewId
  view?: View
} => ({
  activeViewId: input.read.reader.views.activeId(),
  view: input.read.reader.views.active()
})
