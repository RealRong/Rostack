import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts/performance'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import {
  definePhase,
  type ProjectorContext,
  type ProjectorPhase
} from '@shared/projector'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActiveProjectorRunInput,
  ActiveProjectorWorking
} from '../contracts/projector'

export type ActiveProjectorContext<TScope> = ProjectorContext<
  ActiveProjectorRunInput,
  ActiveProjectorWorking,
  ViewState | undefined,
  TScope
>

export type ActiveProjectorPhase<
  TName extends ActivePhaseName
> = ProjectorPhase<
  TName,
  ActiveProjectorContext<ActivePhaseScopeMap[TName]>,
  undefined,
  ActivePhaseMetrics,
  ActivePhaseName,
  ActivePhaseScopeMap
>

export const defineActiveProjectorPhase = <
  TName extends ActivePhaseName
>(
  phase: ActiveProjectorPhase<TName>
): ActiveProjectorPhase<TName> => definePhase(phase)

export const toActivePhaseMetrics = (input: {
  deriveMs: number
  publishMs: number
  stage?: ViewStageMetrics
}): ActivePhaseMetrics => ({
  deriveMs: input.deriveMs,
  publishMs: input.publishMs,
  ...(input.stage ?? {})
})

export const readActiveView = (
  input: ActiveProjectorRunInput
): {
  activeViewId?: ViewId
  view?: View
} => ({
  activeViewId: input.read.reader.views.activeId(),
  view: input.read.reader.views.active()
})
