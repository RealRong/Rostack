import {
  createPlan,
  type ProjectorPlanner
} from '@shared/projector'
import type { ViewState } from '@dataview/engine/contracts/view'
import type {
  ActivePhaseScopeMap,
  ActivePhaseName,
  ActiveProjectorInput
} from '../contracts/projector'
import {
  readActiveProjectorResetContext,
  shouldResetActiveProjector
} from './reset'
import { createPublishPhaseScope } from './scope'

const createEmptyPlan = () => createPlan<ActivePhaseName, ActivePhaseScopeMap>()

const createRunAllPlan = () => createPlan<ActivePhaseName, ActivePhaseScopeMap>({
  phases: [
    'query',
    'membership',
    'summary',
    'publish'
  ]
})

const createResetPlan = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
) => {
  const context = readActiveProjectorResetContext(input, previous)
  if (!shouldResetActiveProjector(context)) {
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

export const activeProjectorPlanner: ProjectorPlanner<
  ActiveProjectorInput,
  ViewState | undefined,
  ActivePhaseName,
  ActivePhaseScopeMap
> = {
  plan: ({ input, previous }) => {
    const resetPlan = createResetPlan(input, previous)
    return resetPlan.phases.size > 0
      ? resetPlan
      : createRunAllPlan()
  }
}
