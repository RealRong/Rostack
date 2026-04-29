import type {
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types'
import {
  set as setCore
} from '@shared/core'
import {
  projectListChange
} from '@shared/delta'
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
import type {
  DataviewMutationDelta
} from '@dataview/engine/mutation/delta'
import { now } from '@dataview/engine/runtime/clock'
import {
  createActiveStageMetrics
} from '../projection/metrics'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]

const hasAnyTouchedField = (
  fields: ReadonlySet<FieldId> | 'all',
  candidates: readonly FieldId[]
): boolean => fields === 'all'
  ? candidates.length > 0
  : setCore.intersectsValues(candidates, fields)

const hasQuerySchemaChanges = (input: {
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => {
  const schemaFields = input.delta.field.schema.touchedIds()
  if (schemaFields === 'all') {
    return true
  }
  if (schemaFields.size === 0) {
    return false
  }

  if (
    hasAnyTouchedField(schemaFields, input.plan.watch.filter)
    || hasAnyTouchedField(schemaFields, input.plan.watch.sort)
  ) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    return true
  }

  return hasAnyTouchedField(schemaFields, input.plan.watch.search)
}

const hasQueryFieldChanges = (input: {
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => {
  const touchedFields = input.delta.field.touchedIds()
  const schemaFields = input.delta.field.schema.touchedIds()

  if (touchedFields === 'all') {
    return true
  }

  if (
    hasAnyTouchedField(touchedFields, input.plan.watch.filter)
    || hasAnyTouchedField(touchedFields, input.plan.watch.sort)
  ) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    return touchedFields.size > 0
      || schemaFields === 'all'
      || schemaFields.size > 0
  }

  return hasAnyTouchedField(touchedFields, input.plan.watch.search)
}

const hasQueryInputChanges = (input: {
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => input.delta.recordSetChanged()
  || hasQuerySchemaChanges(input)
  || hasQueryFieldChanges(input)

const hasSortInputChanges = (input: {
  activeViewId: ViewId
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => {
  if (
    input.delta.recordSetChanged()
    || input.delta.view.query(input.activeViewId).changed('sort')
  ) {
    return true
  }

  for (const fieldId of input.plan.watch.sort) {
    if (input.delta.field.schema.changed(fieldId)) {
      return true
    }
  }

  return hasAnyTouchedField(
    input.delta.field.touchedIds(),
    input.plan.watch.sort
  )
}

const resolveQueryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  delta: DataviewMutationDelta
  previousPlan?: QueryPlan
  plan: QueryPlan
  previous?: QueryPhaseState
}): PhaseAction => {
  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || input.delta.document.activeViewChanged()
  ) {
    return 'rebuild'
  }

  if (
    input.previousPlan?.executionKey !== input.plan.executionKey
    || hasQueryInputChanges({
      delta: input.delta,
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
  delta: DataviewMutationDelta
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
    delta: input.delta,
    plan: input.plan
  })
  const canReuseOrdered = canReuseMatched
    && (
      input.view.sort.rules.ids.length > 0
      || !input.delta.view.query(input.activeViewId).changed('order')
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
  delta: DataviewMutationDelta
  view: View
  plan: QueryPlan
  index: IndexState
  previousPlan?: QueryPlan
  previous?: QueryPhaseState
}) => {
  const action = resolveQueryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    delta: input.delta,
    previousPlan: input.previousPlan,
    plan: input.plan,
    previous: input.previous
  })
  const reuse = resolveQueryReuse({
    action,
    activeViewId: input.activeViewId,
    delta: input.delta,
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
