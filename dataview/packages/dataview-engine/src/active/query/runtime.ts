import {
  dataviewTrace
} from '@dataview/core/mutation'
import type {
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type { DocumentReader } from '@dataview/engine/document/reader'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts/performance'
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
import {
  resolveQueryAction
} from '@dataview/engine/active/projector/policy'
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
  previous?: QueryState
}): {
  action: DeriveAction
  state: QueryState
  delta: QueryDelta
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
  const matched = state.matched.read.ids()
  const ordered = state.ordered.read.ids()
  const visible = state.visible.read.ids()
  const publishMs = 0

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
      added: visible,
      removed: EMPTY_RECORD_IDS,
      orderChanged: false
    }
  } else if (action === 'sync' && input.previous) {
    const previousVisible = input.previous.visible.read.ids()
    const nextVisible = visible
    const previousOrdered = input.previous.ordered.read.ids()
    const nextOrdered = ordered
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
    deriveMs,
    publishMs,
    metrics: {
      inputCount: input.previous?.visible.read.count(),
      outputCount: state.visible.read.count(),
      reusedNodeCount: (
        (input.previous?.matched.read.ids() === matched ? 1 : 0)
        + (input.previous?.ordered.read.ids() === ordered ? 1 : 0)
        + (input.previous?.visible.read.ids() === visible ? 1 : 0)
      ),
      rebuiltNodeCount: (
        3 - (
          (input.previous?.matched.read.ids() === matched ? 1 : 0)
          + (input.previous?.ordered.read.ids() === ordered ? 1 : 0)
          + (input.previous?.visible.read.ids() === visible ? 1 : 0)
        )
      ),
      changedRecordCount
    }
  }
}
