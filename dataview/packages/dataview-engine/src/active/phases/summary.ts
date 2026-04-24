import { runSummaryStage } from '@dataview/engine/active/summary/runtime'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA
} from '@dataview/engine/active/state'
import {
  defineActiveProjectorPhase,
  readActiveView,
  toActivePhaseMetrics
} from '../projector/context'
import { createPublishPhaseScope } from '../projector/scopes/publishScope'

const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

export const activeSummaryPhase = defineActiveProjectorPhase({
  name: 'summary',
  deps: ['membership'],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    const plan = context.input.view.plan
    if (!activeViewId || !view || !plan) {
      return {
        action: 'reuse',
        change: undefined,
        metrics: EMPTY_METRICS
      }
    }

    const previousState = context.working.summary.state
    const membershipScope = context.scope?.membership
    const result = runSummaryStage({
      activeViewId,
      previousViewId: context.previous?.view.id,
      impact: context.input.impact,
      indexDelta: context.input.index.delta,
      view,
      calcFields: plan.calcFields,
      previous: previousState,
      previousMembership: membershipScope?.previous ?? context.working.membership.state,
      membership: context.working.membership.state,
      membershipAction: membershipScope?.action ?? 'reuse',
      membershipDelta: membershipScope?.delta ?? EMPTY_MEMBERSHIP_PHASE_DELTA,
      index: context.input.index.state
    })

    context.working.summary.state = result.state

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
              publish: createPublishPhaseScope({
                summary: {
                  previous: previousState,
                  delta: result.delta
                }
              })
            }
          }
        : {})
    }
  }
})
