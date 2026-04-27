import {
  type ProjectionSpec
} from '@shared/projection'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActiveProjectionCapture,
  ActivePhaseScopeMap,
  ActiveProjectionInput,
  ActiveProjectionWorking
} from './types'
import { activeMembershipPhase } from '../membership/stage'
import { activePublishPhase } from '../publish/stage'
import { activeQueryPhase } from '../query/stage'
import { activeSummaryPhase } from '../summary/stage'
import { createActiveProjectionWorking } from './createWorking'
import {
  readActiveProjectionResetContext,
  shouldResetActiveProjection
} from './reset'

export const activeProjectionSpec: ProjectionSpec<
  ActiveProjectionInput,
  ActiveProjectionWorking,
  {},
  {},
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActivePhaseMetrics,
  ActiveProjectionCapture
> = {
  createState: createActiveProjectionWorking,
  createRead: () => ({}),
  surface: {},
  plan: ({ input, state }) => {
    const previous = state.publish.previous
    const resetContext = readActiveProjectionResetContext(input, previous)
    if (shouldResetActiveProjection(resetContext)) {
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
