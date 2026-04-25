import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import {
  type ProjectorContext,
  type ProjectorPhase,
  type ProjectorScopeValue
} from '@shared/projector'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActiveProjectorInput,
  ActiveProjectorWorking
} from '../contracts/projector'

export type ActiveProjectorContext<TScope> = ProjectorContext<
  ActiveProjectorInput,
  ActiveProjectorWorking,
  ViewState | undefined,
  TScope
>

export type ActiveProjectorPhase<
  TName extends ActivePhaseName
> = ProjectorPhase<
  TName,
  ActiveProjectorContext<ProjectorScopeValue<ActivePhaseScopeMap[TName]>>,
  ActivePhaseMetrics,
  ActivePhaseName,
  ActivePhaseScopeMap
>

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
