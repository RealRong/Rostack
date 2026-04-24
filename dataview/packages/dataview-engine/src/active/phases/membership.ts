import { runMembershipStage } from '@dataview/engine/active/membership/runtime'
import {
  EMPTY_QUERY_PHASE_DELTA
} from '@dataview/engine/active/state'
import {
  defineActiveProjectorPhase,
  readActiveView,
  toActivePhaseMetrics
} from '../projector/context'
import {
  createPublishPhaseScope,
  createSummaryPhaseScope
} from '../projector/scope'

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
