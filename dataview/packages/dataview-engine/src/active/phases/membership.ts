import { runMembershipStage } from '@dataview/engine/active/membership/runtime'
import {
  EMPTY_QUERY_PHASE_DELTA
} from '@dataview/engine/active/state'
import {
  defineActiveProjectorPhase,
  readActiveView,
  toActivePhaseMetrics
} from '../projector/context'
import { createPublishPhaseScope } from '../projector/scopes/publishScope'
import { createSummaryPhaseScope } from '../projector/scopes/summaryScope'

const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

export const activeMembershipPhase = defineActiveProjectorPhase({
  name: 'membership',
  deps: ['query'],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    if (!activeViewId || !view) {
      return {
        action: 'reuse',
        change: undefined,
        metrics: EMPTY_METRICS
      }
    }

    const previousState = context.working.membership.state
    const queryScope = context.scope?.query
    const result = runMembershipStage({
      activeViewId,
      previousViewId: context.previous?.view.id,
      impact: context.input.impact,
      view,
      query: context.working.query.state,
      queryDelta: queryScope?.delta ?? EMPTY_QUERY_PHASE_DELTA,
      previous: previousState,
      index: context.input.index.state,
      indexDelta: context.input.index.delta
    })

    context.working.membership.state = result.state

    return {
      action: result.action,
      change: undefined,
      metrics: toActivePhaseMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      }),
      ...(result.action !== 'reuse'
        ? {
            emit: {
              summary: createSummaryPhaseScope({
                action: result.action,
                previous: previousState,
                delta: result.delta
              }),
              publish: createPublishPhaseScope({
                membership: {
                  previous: previousState
                }
              })
            }
          }
        : {})
    }
  }
})
