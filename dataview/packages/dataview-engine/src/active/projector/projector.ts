import type {
  Field,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  createProjector,
  defineProjectorSpec,
  type DefaultProjectorScopeMap,
  type ProjectorContext,
  type ProjectorPhase,
  type ProjectorPublisher,
} from '@shared/projector'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA,
  EMPTY_QUERY_PHASE_DELTA,
  EMPTY_SUMMARY_PHASE_DELTA,
  resetActiveProjectorWorking
} from '@dataview/engine/active/projector/working'
import { runMembershipStage } from '@dataview/engine/active/membership/runtime'
import { runPublishStage } from '@dataview/engine/active/publish/runtime'
import { runQueryStage } from '@dataview/engine/active/query/runtime'
import { runSummaryStage } from '@dataview/engine/active/summary/runtime'
import { createActiveProjectorPlan } from '@dataview/engine/active/projector/planner'
import { createActiveProjectorTrace } from '@dataview/engine/active/projector/trace'
import { createActiveProjectorWorking } from '@dataview/engine/active/projector/working'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { BaseImpact } from '@dataview/engine/active/shared/baseImpact'
import type { ItemIdPool } from '@dataview/engine/active/shared/itemIdPool'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction,
  QueryPhaseDelta,
  QueryPhaseState,
  SummaryPhaseDelta,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import type {
  ActiveDelta
} from '@dataview/engine/contracts/delta'
import type {
  SnapshotTrace,
  ViewStageMetrics,
  ViewTrace
} from '@dataview/engine/contracts/performance'
import type {
  ViewRecords
} from '@dataview/engine/contracts/shared'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import type { DocumentReader } from '@dataview/engine/document/reader'

export type ActivePhaseName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'

export interface ActiveProjectorInput {
  read: {
    reader: DocumentReader
    fieldsById: ReadonlyMap<FieldId, Field>
  }
  view: {
    plan?: ViewPlan
    previousPlan?: ViewPlan
  }
  index: {
    state: IndexState
    delta?: IndexDelta
  }
  impact: BaseImpact
}

export interface ActiveProjectorRunInput extends ActiveProjectorInput {
  runId: number
}

export interface ActivePhaseMetrics extends ViewStageMetrics {
  deriveMs: number
  publishMs: number
}

export interface ActiveProjectorWorking {
  query: {
    state: QueryPhaseState
    records: ViewRecords
    delta: QueryPhaseDelta
    runId: number
  }
  membership: {
    state: MembershipPhaseState
    previousState: MembershipPhaseState
    delta: MembershipPhaseDelta
    action: PhaseAction
    runId: number
  }
  summary: {
    state: SummaryPhaseState
    previousState: SummaryPhaseState
    delta: SummaryPhaseDelta
    runId: number
  }
  publish: {
    itemIds: ItemIdPool
    snapshot?: ViewState
    delta?: ActiveDelta
  }
}

export interface ActiveProjectorTrace {
  view: ViewTrace
  snapshot: SnapshotTrace
  snapshotMs: number
}

export interface ActiveProjectorResult {
  snapshot?: ViewState
  delta?: ActiveDelta
  trace: ActiveProjectorTrace
}

export interface ActiveProjector {
  update(input: ActiveProjectorInput): ActiveProjectorResult
}

const createMetrics = (input: {
  deriveMs: number
  publishMs: number
  stage?: ViewStageMetrics
}): ActivePhaseMetrics => ({
  deriveMs: input.deriveMs,
  publishMs: input.publishMs,
  ...(input.stage ?? {})
})

type ActivePhaseContext = ProjectorContext<
  ActiveProjectorRunInput,
  ActiveProjectorWorking,
  ViewState | undefined,
  undefined
>

type QueryPhase = ProjectorPhase<
  'query',
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics,
  ActivePhaseName
>

type MembershipPhase = ProjectorPhase<
  'membership',
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics,
  ActivePhaseName
>

type SummaryPhase = ProjectorPhase<
  'summary',
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics,
  ActivePhaseName
>

type PublishPhase = ProjectorPhase<
  'publish',
  ActivePhaseContext,
  undefined,
  ActivePhaseMetrics,
  ActivePhaseName
>

const readActiveView = (
  input: ActiveProjectorRunInput
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

const queryPhase: QueryPhase = {
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

const membershipPhase: MembershipPhase = {
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
      : EMPTY_QUERY_PHASE_DELTA
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

const summaryPhase: SummaryPhase = {
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
      : EMPTY_MEMBERSHIP_PHASE_DELTA
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

const publishPhase: PublishPhase = {
  name: 'publish',
  deps: ['query', 'membership', 'summary'],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    if (!activeViewId || !view) {
      const reset = createPublishReset(context.previous)
      resetActiveProjectorWorking(context.working)
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
        : EMPTY_SUMMARY_PHASE_DELTA,
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

const createActiveProjectorPublisher = (): ProjectorPublisher<
  ActiveProjectorWorking,
  ViewState | undefined,
  ActiveDelta | undefined
> => ({
  publish: ({ previous, working }) => ({
    snapshot: working.publish.snapshot,
    change: working.publish.snapshot === previous
      ? undefined
      : working.publish.delta
  })
})

const activeProjectorSpec = defineProjectorSpec({
  createWorking: createActiveProjectorWorking,
  createSnapshot: () => undefined,
  plan: createActiveProjectorPlan().plan,
  publish: createActiveProjectorPublisher().publish,
  phases: [
    queryPhase,
    membershipPhase,
    summaryPhase,
    publishPhase
  ]
})

export const createActiveProjector = (): ActiveProjector => {
  const projector = createProjector(activeProjectorSpec)
  let runId = 0

  return {
    update: (input: ActiveProjectorInput): ActiveProjectorResult => {
      runId += 1
      const previous = projector.snapshot()
      const result = projector.update({
        ...input,
        runId
      })
      const trace = createActiveProjectorTrace({
        previous,
        next: result.snapshot,
        projectorTrace: result.trace
      })

      return {
        snapshot: result.snapshot,
        ...(result.change
          ? {
              delta: result.change
            }
          : {}),
        trace
      }
    }
  }
}
