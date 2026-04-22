import {
  runMembershipStage
} from '@dataview/engine/active/snapshot/membership/runtime'
import { runPublishStage } from '@dataview/engine/active/snapshot/publish/runtime'
import { runQueryStage } from '@dataview/engine/active/snapshot/query/runtime'
import { runSummaryStage } from '@dataview/engine/active/snapshot/summary/runtime'
import type { View, ViewId } from '@dataview/core/contracts'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type { ViewStageMetrics, ViewState } from '@dataview/engine/contracts'
import type {
  PhaseSpec,
  RuntimeContext
} from '@shared/projection-runtime'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActiveProjectionRunInput,
  ActiveProjectionWorking
} from './contracts'
import {
  EMPTY_MEMBERSHIP_DELTA,
  EMPTY_QUERY_DELTA,
  EMPTY_SUMMARY_DELTA,
  resetActiveProjectionWorking
} from './working'

const createMetrics = (input: {
  deriveMs: number
  publishMs: number
  stage?: ViewStageMetrics
}): ActivePhaseMetrics => ({
  deriveMs: input.deriveMs,
  publishMs: input.publishMs,
  ...(input.stage ?? {})
})

type ActivePhaseContext = RuntimeContext<
  ActiveProjectionRunInput,
  ActiveProjectionWorking,
  ViewState | undefined
>

const readActiveView = (
  input: ActiveProjectionRunInput
): {
  activeViewId?: ViewId
  view?: View
} => {
  const activeViewId = input.read.reader.views.activeId()
  const view = input.read.reader.views.active()

  return {
    activeViewId,
    view
  }
}

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

const queryPhase: PhaseSpec<
  ActivePhaseName,
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics
> = {
  name: 'query',
  deps: [],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    const plan = context.input.view.plan
    if (!activeViewId || !view || !plan) {
      return {
        action: 'reuse',
        change: undefined,
        metrics: createMetrics({
          deriveMs: 0,
          publishMs: 0
        })
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
    context.working.query.delta = result.delta
    context.working.query.runId = context.input.runId

    return {
      action: result.action,
      change: undefined,
      metrics: createMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      })
    }
  }
}

const membershipPhase: PhaseSpec<
  ActivePhaseName,
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics
> = {
  name: 'membership',
  deps: ['query'],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    if (!activeViewId || !view) {
      return {
        action: 'reuse',
        change: undefined,
        metrics: createMetrics({
          deriveMs: 0,
          publishMs: 0
        })
      }
    }

    const queryDelta = context.working.query.runId === context.input.runId
      ? context.working.query.delta
      : EMPTY_QUERY_DELTA
    const previousState = context.working.membership.state
    const result = runMembershipStage({
      activeViewId,
      previousViewId: context.previous?.view.id,
      impact: context.input.impact,
      view,
      query: context.working.query.state,
      queryDelta,
      previous: previousState,
      index: context.input.index.state,
      indexDelta: context.input.index.delta
    })

    context.working.membership.previousState = previousState
    context.working.membership.state = result.state
    context.working.membership.delta = result.delta
    context.working.membership.action = result.action
    context.working.membership.runId = context.input.runId

    return {
      action: result.action,
      change: undefined,
      metrics: createMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      })
    }
  }
}

const summaryPhase: PhaseSpec<
  ActivePhaseName,
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics
> = {
  name: 'summary',
  deps: ['membership'],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    const plan = context.input.view.plan
    if (!activeViewId || !view || !plan) {
      return {
        action: 'reuse',
        change: undefined,
        metrics: createMetrics({
          deriveMs: 0,
          publishMs: 0
        })
      }
    }

    const membershipRan = context.working.membership.runId === context.input.runId
    const previousMembership = membershipRan
      ? context.working.membership.previousState
      : context.working.membership.state
    const membershipDelta = membershipRan
      ? context.working.membership.delta
      : EMPTY_MEMBERSHIP_DELTA
    const membershipAction = membershipRan
      ? context.working.membership.action
      : 'reuse'
    const previousState = context.working.summary.state
    const result = runSummaryStage({
      activeViewId,
      previousViewId: context.previous?.view.id,
      impact: context.input.impact,
      indexDelta: context.input.index.delta,
      view,
      calcFields: plan.calcFields,
      previous: previousState,
      previousMembership,
      membership: context.working.membership.state,
      membershipAction,
      membershipDelta,
      index: context.input.index.state
    })

    context.working.summary.previousState = previousState
    context.working.summary.state = result.state
    context.working.summary.delta = result.delta
    context.working.summary.runId = context.input.runId

    return {
      action: result.action,
      change: undefined,
      metrics: createMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      })
    }
  }
}

const publishPhase: PhaseSpec<
  ActivePhaseName,
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics
> = {
  name: 'publish',
  deps: ['query', 'membership', 'summary'],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    if (!activeViewId || !view) {
      const reset = createPublishReset(context.previous)
      resetActiveProjectionWorking(context.working)
      context.working.publish.snapshot = reset.snapshot
      context.working.publish.delta = reset.delta

      return {
        action: reset.action,
        change: undefined,
        metrics: createMetrics({
          deriveMs: 0,
          publishMs: 0
        })
      }
    }

    const membershipRan = context.working.membership.runId === context.input.runId
    const summaryRan = context.working.summary.runId === context.input.runId
    const result = runPublishStage({
      reader: context.input.read.reader,
      fieldsById: context.input.read.fieldsById,
      activeViewId,
      previous: context.previous,
      view,
      records: context.working.query.records,
      membershipState: context.working.membership.state,
      previousMembershipState: membershipRan
        ? context.working.membership.previousState
        : context.working.membership.state,
      previousSections: context.previous?.sections,
      previousItems: context.previous?.items,
      summaryState: context.working.summary.state,
      summaryDelta: summaryRan
        ? context.working.summary.delta
        : EMPTY_SUMMARY_DELTA,
      previousSummaryState: summaryRan
        ? context.working.summary.previousState
        : context.working.summary.state,
      previousSummaries: context.previous?.summaries,
      itemIds: context.working.publish.itemIds
    })

    context.working.publish.snapshot = result.snapshot
    context.working.publish.delta = result.delta

    return {
      action: result.action,
      change: undefined,
      metrics: createMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      })
    }
  }
}

export const createActiveProjectionPhases = (): readonly PhaseSpec<
  ActivePhaseName,
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics
>[] => [
  queryPhase,
  membershipPhase,
  summaryPhase,
  publishPhase
]
