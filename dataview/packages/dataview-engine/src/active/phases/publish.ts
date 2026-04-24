import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type { ViewState } from '@dataview/engine/contracts/view'
import { runPublishStage } from '@dataview/engine/active/publish/runtime'
import {
  EMPTY_SUMMARY_PHASE_DELTA
} from '@dataview/engine/active/state'
import {
  defineActiveProjectorPhase,
  readActiveView,
  toActivePhaseMetrics
} from '../projector/context'
import { mergePublishPhaseScope } from '../projector/scope'

const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

const createPublishReset = (
  previous: ViewState | undefined
): {
  snapshot?: undefined
  delta?: ActiveDelta
  action: 'reuse' | 'sync'
} => previous
  ? {
      snapshot: undefined,
      delta: {
        reset: true
      },
      action: 'sync'
    }
  : {
      snapshot: undefined,
      delta: undefined,
      action: 'reuse'
    }

export const activePublishPhase = defineActiveProjectorPhase({
  name: 'publish',
  deps: ['query', 'membership', 'summary'],
  mergeScope: mergePublishPhaseScope,
  run: (context) => {
    const scope = context.scope
    const { activeViewId, view } = readActiveView(context.input)
    if (scope?.reset || !activeViewId || !view) {
      const reset = createPublishReset(context.previous)
      context.working.publish.itemIds.gc.clear()
      context.working.publish.snapshot = reset.snapshot
      context.working.publish.delta = reset.delta

      return {
        action: reset.action,
        metrics: EMPTY_METRICS
      }
    }

    const result = runPublishStage({
      reader: context.input.read.reader,
      activeViewId,
      previous: context.previous,
      view,
      queryState: context.working.query.state,
      previousRecords: context.previous?.records,
      membershipState: context.working.membership.state,
      previousMembershipState: scope?.membership?.previous ?? context.working.membership.state,
      previousSections: context.previous?.sections,
      previousItems: context.previous?.items,
      summaryState: context.working.summary.state,
      summaryDelta: scope?.summary?.delta ?? EMPTY_SUMMARY_PHASE_DELTA,
      previousSummaryState: scope?.summary?.previous ?? context.working.summary.state,
      previousSummaries: context.previous?.summaries,
      itemIds: context.working.publish.itemIds
    })

    context.working.publish.snapshot = result.snapshot
    context.working.publish.delta = result.delta

    return {
      action: result.action,
      metrics: toActivePhaseMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      })
    }
  }
})
