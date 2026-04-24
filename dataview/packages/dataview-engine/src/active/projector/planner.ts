import {
  createPlan,
  mergePlans,
  type ProjectorPlanner
} from '@shared/projector'
import type { ViewState } from '@dataview/engine/contracts/view'
import type {
  ActivePhaseScopeMap,
  ActivePhaseName,
  ActiveProjectorInput
} from '../contracts/projector'
import {
  readActiveProjectionContext,
  resolveMembershipPlanPolicy,
  resolvePublishPlanPolicy,
  resolveQueryPlanPolicy,
  resolveSummaryPlanPolicy,
  shouldResetActiveProjection
} from './policy'
import { createPublishPhaseScope } from './scope'

const createEmptyPlan = () => createPlan<ActivePhaseName, ActivePhaseScopeMap>()

const planReset = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
) => {
  const context = readActiveProjectionContext(input, previous)
  if (!shouldResetActiveProjection(context)) {
    return createEmptyPlan()
  }

  return previous
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        scope: {
          publish: createPublishPhaseScope({
            reset: true
          })
        }
      })
    : createEmptyPlan()
}

const planQuery = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
) => {
  const shouldRun = resolveQueryPlanPolicy({
    context: readActiveProjectionContext(input, previous),
    projector: input
  }).shouldRun

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['query']
      })
    : createEmptyPlan()
}

const planMembership = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
) => {
  const shouldRun = resolveMembershipPlanPolicy({
    context: readActiveProjectionContext(input, previous),
    projector: input
  }).shouldRun

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['membership']
      })
    : createEmptyPlan()
}

const planSummary = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
) => {
  const shouldRun = resolveSummaryPlanPolicy({
    context: readActiveProjectionContext(input, previous),
    projector: input
  }).shouldRun

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['summary']
      })
    : createEmptyPlan()
}

const planPublish = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
) => {
  const shouldRun = resolvePublishPlanPolicy({
    context: readActiveProjectionContext(input, previous),
    projector: input
  }).shouldRun

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['publish']
      })
    : createEmptyPlan()
}

export const activeProjectorPlanner: ProjectorPlanner<
  ActiveProjectorInput,
  ViewState | undefined,
  ActivePhaseName,
  ActivePhaseScopeMap
> = {
  plan: ({ input, previous }) => mergePlans(
    planReset(input, previous),
    planQuery(input, previous),
    planMembership(input, previous),
    planSummary(input, previous),
    planPublish(input, previous)
  )
}
