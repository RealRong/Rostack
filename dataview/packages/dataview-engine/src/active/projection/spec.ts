import {
  type ProjectionSpec
} from '@shared/projection'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActiveProjectionCapture,
  ActivePhaseScopeMap,
  ActiveProjectorInput,
  ActiveProjectorWorking
} from '../contracts/projector'
import { activeMembershipPhase } from '../membership/stage'
import { activePublishPhase } from '../publish/stage'
import { activeQueryPhase } from '../query/stage'
import { activeSummaryPhase } from '../summary/stage'
import { createActiveProjectorWorking } from './createWorking'
import {
  readActiveProjectorResetContext,
  shouldResetActiveProjector
} from './reset'

export const activeProjectorSpec: ProjectionSpec<
  ActiveProjectorInput,
  ActiveProjectorWorking,
  {},
  {},
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActivePhaseMetrics,
  ActiveProjectionCapture
> = {
  createState: createActiveProjectorWorking,
  createRead: () => ({}),
  surface: {},
  plan: ({ input, state }) => {
    const previous = state.publish.previous
    const resetContext = readActiveProjectorResetContext(input, previous)
    if (shouldResetActiveProjector(resetContext)) {
      return previous
        ? {
            scope: {
              publish: {
                reset: true
              }
            }
          }
        : {}
    }

    return {
      phases: ['query', 'membership', 'summary', 'publish']
    }
  },
  capture: ({ state }) => ({
    snapshot: state.publish.snapshot,
    delta: state.publish.snapshot === state.publish.previous
      ? undefined
      : state.publish.delta
  }),
  phases: {
    query: activeQueryPhase,
    membership: activeMembershipPhase,
    summary: activeSummaryPhase,
    publish: activePublishPhase
  }
}
