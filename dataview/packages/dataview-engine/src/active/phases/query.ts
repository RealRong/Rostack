import { runQueryStage } from '@dataview/engine/active/query/runtime'
import {
  defineActiveProjectorPhase,
  readActiveView,
  toActivePhaseMetrics
} from '../projector/context'
import { createMembershipPhaseScope } from '../projector/scopes/membershipScope'

const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

export const activeQueryPhase = defineActiveProjectorPhase({
  name: 'query',
  deps: [],
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

    const result = runQueryStage({
      reader: context.input.read.reader,
      activeViewId,
      previousViewId: context.previous?.view.id,
      impact: context.input.impact,
      view,
      plan: plan.query,
      previousPlan: context.input.view.previousPlan?.query,
      index: context.input.index.state,
      previous: context.working.query.state,
      previousPublished: context.previous?.records
    })

    context.working.query.state = result.state
    context.working.query.records = result.records

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
              membership: createMembershipPhaseScope({
                action: result.action,
                delta: result.delta
              })
            }
          }
        : {})
    }
  }
})
