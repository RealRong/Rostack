import { impact as commitImpact } from '@dataview/core/commit/impact'
import type {
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type { DocumentReader } from '@dataview/engine/document/reader'
import type {
  ViewRecords,
  ViewStageMetrics
} from '@dataview/engine/contracts'
import {
  type QueryPlan
} from '@dataview/engine/active/plan'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import {
  set as setCore
} from '@shared/core'
import {
  readSelectionIdSet
} from '@dataview/engine/active/shared/selection'
import type {
  PhaseAction as DeriveAction,
  QueryPhaseDelta as QueryDelta,
  QueryPhaseState as QueryState
} from '@dataview/engine/active/state'
import { now } from '@dataview/engine/runtime/clock'

export {
  buildQueryState
} from '@dataview/engine/active/query/state'
import {
  buildQueryState
} from '@dataview/engine/active/query/state'

const queryUsesChangedFields = (
  fields: readonly FieldId[] | 'all',
  changedFields: ReadonlySet<FieldId>
) => fields === 'all'
  ? changedFields.size > 0
  : setCore.intersectsValues(fields, changedFields)

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_VISIBLE_DIFF = {
  added: EMPTY_RECORD_IDS,
  removed: EMPTY_RECORD_IDS
} as const

const collectVisibleDiff = (input: {
  previous: readonly RecordId[]
  next: readonly RecordId[]
  previousSet?: ReadonlySet<RecordId>
  nextSet?: ReadonlySet<RecordId>
}): {
  added: readonly RecordId[]
  removed: readonly RecordId[]
} => {
  if (input.previous === input.next) {
    return EMPTY_VISIBLE_DIFF
  }

  if (!input.previous.length) {
    return input.next.length
      ? {
          added: input.next,
          removed: EMPTY_RECORD_IDS
        }
      : EMPTY_VISIBLE_DIFF
  }

  if (!input.next.length) {
    return {
      added: EMPTY_RECORD_IDS,
      removed: input.previous
    }
  }

  const previousIsSmaller = input.previous.length <= input.next.length
  const added: RecordId[] = []
  const removed: RecordId[] = []

  if (previousIsSmaller) {
    const previousSet = input.previousSet ?? new Set(input.previous)

    for (let index = 0; index < input.next.length; index += 1) {
      const recordId = input.next[index]!
      if (!previousSet.has(recordId)) {
        added.push(recordId)
      }
    }

    if (!added.length && input.previous.length === input.next.length) {
      return EMPTY_VISIBLE_DIFF
    }

    if (input.previous.length + added.length !== input.next.length) {
      const nextSet = input.nextSet ?? new Set(input.next)
      for (let index = 0; index < input.previous.length; index += 1) {
        const recordId = input.previous[index]!
        if (!nextSet.has(recordId)) {
          removed.push(recordId)
        }
      }
    }
  } else {
    const nextSet = input.nextSet ?? new Set(input.next)

    for (let index = 0; index < input.previous.length; index += 1) {
      const recordId = input.previous[index]!
      if (!nextSet.has(recordId)) {
        removed.push(recordId)
      }
    }

    if (input.next.length + removed.length !== input.previous.length) {
      const previousSet = input.previousSet ?? new Set(input.previous)
      for (let index = 0; index < input.next.length; index += 1) {
        const recordId = input.next[index]!
        if (!previousSet.has(recordId)) {
          added.push(recordId)
        }
      }
    }
  }

  return {
    added: added.length
      ? added
      : EMPTY_RECORD_IDS,
    removed: removed.length
      ? removed
      : EMPTY_RECORD_IDS
  }
}

const resolveQueryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  previousPlan?: QueryPlan
  plan: QueryPlan
  previous?: QueryState
}): DeriveAction => {
  const commit = input.impact.commit

  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || commitImpact.has.activeView(commit)
  ) {
    return 'rebuild'
  }

  if (input.previousPlan?.executionKey !== input.plan.executionKey) {
    return 'sync'
  }

  for (const fieldId of input.plan.watch.filter) {
    if (commitImpact.has.fieldSchema(commit, fieldId)) {
      return 'sync'
    }
  }
  for (const fieldId of input.plan.watch.sort) {
    if (commitImpact.has.fieldSchema(commit, fieldId)) {
      return 'sync'
    }
  }
  if (input.plan.watch.search === 'all') {
    if (input.impact.schemaFields.size > 0) {
      return 'sync'
    }
  } else {
    for (const fieldId of input.plan.watch.search) {
      if (commitImpact.has.fieldSchema(commit, fieldId)) {
        return 'sync'
      }
    }
  }

  const changedFields = input.impact.touchedFields
  if (changedFields === 'all') {
    return 'sync'
  }

  if (
    commitImpact.has.recordSetChange(commit)
    || setCore.intersectsValues(input.plan.watch.filter, changedFields)
    || setCore.intersectsValues(input.plan.watch.sort, changedFields)
    || (
      (
        input.plan.watch.search === 'all'
        || input.plan.watch.search.length !== 0
      )
      && queryUsesChangedFields(input.plan.watch.search, changedFields)
    )
  ) {
    return 'sync'
  }

  return 'reuse'
}

const hasSortInputChanges = (input: {
  activeViewId: ViewId
  impact: BaseImpact
  plan: QueryPlan
}): boolean => {
  const commit = input.impact.commit
  if (
    input.impact.recordSetChanged
    || commitImpact.has.viewQuery(commit, input.activeViewId, ['sort'])
  ) {
    return true
  }

  for (const fieldId of input.plan.watch.sort) {
    if (commitImpact.has.fieldSchema(commit, fieldId)) {
      return true
    }
  }

  const changedFields = input.impact.touchedFields
  return changedFields === 'all'
    || setCore.intersectsValues(input.plan.watch.sort, changedFields)
}

const resolveQueryReuse = (input: {
  action: DeriveAction
  activeViewId: ViewId
  impact: BaseImpact
  view: View
  plan: QueryPlan
  previous?: QueryState
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
      input.view.sort.length > 0
      || !commitImpact.has.viewQuery(input.impact.commit, input.activeViewId, ['order'])
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

const publishRecords = (input: {
  previous?: ViewRecords
  state: QueryState
}): ViewRecords => {
  const matched = input.state.matched.read.ids()
  const ordered = input.state.ordered.read.ids()
  const visible = input.state.visible.read.ids()

  if (
    input.previous
    && input.previous.matched === matched
    && input.previous.ordered === ordered
    && input.previous.visible === visible
  ) {
    return input.previous
  }

  return {
    matched,
    ordered,
    visible
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
  previous?: QueryState
  previousPublished?: ViewRecords
}): {
  action: DeriveAction
  state: QueryState
  delta: QueryDelta
  records: ViewRecords
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
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
  const canReusePublished = (
    input.previousPublished !== undefined
    && state.matched.read.ids() === input.previousPublished.matched
    && state.ordered.read.ids() === input.previousPublished.ordered
    && state.visible.read.ids() === input.previousPublished.visible
  )
  const publishStart = canReusePublished
    ? 0
    : now()
  const records: ViewRecords = canReusePublished
    ? input.previousPublished!
    : publishRecords({
        previous: input.previousPublished,
        state
      })
  const publishMs = canReusePublished
    ? 0
    : now() - publishStart

  let changedRecordCount = 0
  let delta: QueryDelta = {
    rebuild: action === 'rebuild',
    added: EMPTY_RECORD_IDS,
    removed: EMPTY_RECORD_IDS,
    orderChanged: false
  }
  if (action === 'rebuild') {
    delta = {
      rebuild: true,
      added: state.visible.read.ids(),
      removed: EMPTY_RECORD_IDS,
      orderChanged: false
    }
  } else if (action === 'sync' && input.previous) {
    const previousVisible = input.previous.visible.read.ids()
    const nextVisible = state.visible.read.ids()
    const previousOrdered = input.previous.ordered.read.ids()
    const nextOrdered = state.ordered.read.ids()
    const orderChanged = previousOrdered !== nextOrdered
    const diff = collectVisibleDiff({
      previous: previousVisible,
      next: nextVisible,
      previousSet: previousVisible.length <= nextVisible.length
        ? readSelectionIdSet(input.previous.visible)
        : undefined,
      nextSet: nextVisible.length < previousVisible.length
        ? readSelectionIdSet(state.visible)
        : undefined
    })

    if (
      diff.added.length
      || diff.removed.length
      || orderChanged
    ) {
      changedRecordCount = diff.added.length + diff.removed.length
    }
    delta = {
      rebuild: false,
      added: diff.added,
      removed: diff.removed,
      orderChanged
    }
  }

  return {
    action,
    state,
    delta,
    records,
    deriveMs,
    publishMs,
    metrics: {
      inputCount: input.previous?.visible.read.count(),
      outputCount: state.visible.read.count(),
      reusedNodeCount: (
        (input.previousPublished?.matched === records.matched ? 1 : 0)
        + (input.previousPublished?.ordered === records.ordered ? 1 : 0)
        + (input.previousPublished?.visible === records.visible ? 1 : 0)
      ),
      rebuiltNodeCount: (
        3 - (
          (input.previousPublished?.matched === records.matched ? 1 : 0)
          + (input.previousPublished?.ordered === records.ordered ? 1 : 0)
          + (input.previousPublished?.visible === records.visible ? 1 : 0)
        )
      ),
      changedRecordCount
    }
  }
}
