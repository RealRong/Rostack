import {
  dataviewTrace
} from '@dataview/core/mutation'
import type {
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  set as setCore
} from '@shared/core'
import {
  projectListChange
} from '@shared/projector/publish'
import type {
  QueryPlan
} from '@dataview/engine/active/plan'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  readSelectionIdSet
} from '@dataview/engine/active/shared/selection'
import type {
  PhaseAction,
  QueryPhaseDelta,
  QueryPhaseState
} from '@dataview/engine/active/state'
import {
  buildQueryState
} from '@dataview/engine/active/query/state'
import type {
  DocumentReader
} from '@dataview/engine/document/reader'
import { now } from '@dataview/engine/runtime/clock'
import {
  type BaseImpact,
  hasQueryInputChanges
} from '../projector/impact'
import {
  type ActiveProjectorPhase,
  readActiveView
} from '../projector/context'
import {
  createActiveStageMetrics,
  toActivePhaseMetrics
} from '../projector/metrics'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

const hasSortInputChanges = (input: {
  activeViewId: ViewId
  impact: BaseImpact
  plan: QueryPlan
}): boolean => {
  if (
    input.impact.recordSetChanged
    || dataviewTrace.has.viewQuery(input.impact.trace, input.activeViewId, ['sort'])
  ) {
    return true
  }

  for (const fieldId of input.plan.watch.sort) {
    if (dataviewTrace.has.fieldSchema(input.impact.trace, fieldId)) {
      return true
    }
  }

  const changedFields = input.impact.touchedFields
  return changedFields === 'all'
    || setCore.intersectsValues(input.plan.watch.sort, changedFields)
}

const resolveQueryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  previousPlan?: QueryPlan
  plan: QueryPlan
  previous?: QueryPhaseState
}): PhaseAction => {
  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || dataviewTrace.has.activeView(input.impact.trace)
  ) {
    return 'rebuild'
  }

  if (
    input.previousPlan?.executionKey !== input.plan.executionKey
    || hasQueryInputChanges({
      impact: input.impact,
      plan: input.plan
    })
  ) {
    return 'sync'
  }

  return 'reuse'
}

const resolveQueryReuse = (input: {
  action: PhaseAction
  activeViewId: ViewId
  impact: BaseImpact
  view: View
  plan: QueryPlan
  previous?: QueryPhaseState
}): {
  matched?: readonly RecordId[]
  ordered?: readonly RecordId[]
} | undefined => {
  if (
    input.action !== 'sync'
    || !input.previous
  ) {
    return undefined
  }

  const canReuseMatched = !hasSortInputChanges({
    activeViewId: input.activeViewId,
    impact: input.impact,
    plan: input.plan
  })
  const canReuseOrdered = canReuseMatched
    && (
      input.view.sort.rules.order.length > 0
      || !dataviewTrace.has.viewQuery(input.impact.trace, input.activeViewId, ['order'])
    )

  if (!canReuseMatched && !canReuseOrdered) {
    return undefined
  }

  return {
    ...(canReuseMatched
      ? {
          matched: input.previous.matched.read.ids()
        }
      : {}),
    ...(canReuseOrdered
      ? {
          ordered: input.previous.ordered.read.ids()
        }
      : {})
  }
}

export const runQueryStage = (input: {
  reader: DocumentReader
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  view: View
  plan: QueryPlan
  index: IndexState
  previousPlan?: QueryPlan
  previous?: QueryPhaseState
}) => {
  const action = resolveQueryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    previousPlan: input.previousPlan,
    plan: input.plan,
    previous: input.previous
  })
  const reuse = resolveQueryReuse({
    action,
    activeViewId: input.activeViewId,
    impact: input.impact,
    view: input.view,
    plan: input.plan,
    previous: input.previous
  })
  const deriveStart = now()
  const state = action === 'reuse' && input.previous
    ? input.previous
    : buildQueryState({
        reader: input.reader,
        view: input.view,
        index: input.index,
        plan: input.plan,
        previous: input.previous,
        reuse
      })
  const deriveMs = now() - deriveStart
  const matched = state.matched.read.ids()
  const ordered = state.ordered.read.ids()
  const visible = state.visible.read.ids()

  let changedRecordCount = 0
  let delta: QueryPhaseDelta = {
    rebuild: action === 'rebuild',
    added: EMPTY_RECORD_IDS,
    removed: EMPTY_RECORD_IDS,
    orderChanged: false
  }

  if (action === 'rebuild') {
    delta = {
      rebuild: true,
      added: visible,
      removed: EMPTY_RECORD_IDS,
      orderChanged: false
    }
  } else if (action === 'sync' && input.previous) {
    const previousVisible = input.previous.visible.read.ids()
    const nextVisible = visible
    const previousOrdered = input.previous.ordered.read.ids()
    const nextOrdered = ordered
    const diff = projectListChange({
      previous: previousVisible,
      next: nextVisible,
      previousSet: previousVisible.length <= nextVisible.length
        ? readSelectionIdSet(input.previous.visible)
        : undefined,
      nextSet: nextVisible.length < previousVisible.length
        ? readSelectionIdSet(state.visible)
        : undefined
    })

    if (diff.changed || previousOrdered !== nextOrdered) {
      changedRecordCount = diff.added.length + diff.removed.length
    }
    delta = {
      rebuild: false,
      added: diff.added,
      removed: diff.removed,
      orderChanged: previousOrdered !== nextOrdered
    }
  }

  const reusedNodeCount = (
    (input.previous?.matched.read.ids() === matched ? 1 : 0)
    + (input.previous?.ordered.read.ids() === ordered ? 1 : 0)
    + (input.previous?.visible.read.ids() === visible ? 1 : 0)
  )

  return {
    action,
    state,
    delta,
    deriveMs,
    publishMs: 0,
    metrics: createActiveStageMetrics({
      inputCount: input.previous?.visible.read.count(),
      outputCount: state.visible.read.count(),
      reusedNodeCount,
      rebuiltNodeCount: 3 - reusedNodeCount,
      changedRecordCount
    })
  }
}

export const activeQueryPhase: ActiveProjectorPhase<'query'> = {
  after: [],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    const plan = context.input.view.plan
    if (!activeViewId || !view || !plan) {
      return {
        action: 'reuse',
        metrics: EMPTY_METRICS
      }
    }

    const result = runQueryStage({
      reader: context.input.read.reader,
      activeViewId,
      previousViewId: context.state.publish.previous?.view.id,
      impact: context.input.impact,
      view,
      plan: plan.query,
      previousPlan: context.input.view.previousPlan?.query,
      index: context.input.index.state,
      previous: context.state.query.state
    })

    context.state.query.state = result.state

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
              membership: {
                query: {
                  action: result.action,
                  delta: result.delta
                }
              }
            }
          }
        : {})
    }
  }
}
