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
import { impact as commitImpact } from '@dataview/core/commit/impact'
import {
  type QueryPlan
} from '@dataview/engine/active/plan'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import { runSnapshotStage } from '@dataview/engine/active/snapshot/stage'
import {
  ensureQueryImpact
} from '@dataview/engine/active/shared/impact'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import type {
  DeriveAction,
  QueryDelta,
  QueryState
} from '@dataview/engine/contracts/state'
import {
  readQueryVisibleSet
} from '@dataview/engine/contracts/state'
export {
  buildQueryState
} from '@dataview/engine/active/snapshot/query/derive'
import {
  buildQueryState
} from '@dataview/engine/active/snapshot/query/derive'

const hasIntersection = (
  left: ReadonlySet<FieldId>,
  right: ReadonlySet<FieldId>
) => {
  for (const value of left) {
    if (right.has(value)) {
      return true
    }
  }

  return false
}

const queryUsesChangedFields = (
  fields: readonly FieldId[] | 'all',
  changedFields: ReadonlySet<FieldId>
) => fields === 'all'
  ? changedFields.size > 0
  : hasIntersection(new Set(fields), changedFields)

const EMPTY_RECORD_IDS = [] as RecordId[]
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
  impact: ActiveImpact
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
    if (input.impact.base.schemaFields.size > 0) {
      return 'sync'
    }
  } else {
    for (const fieldId of input.plan.watch.search) {
      if (commitImpact.has.fieldSchema(commit, fieldId)) {
        return 'sync'
      }
    }
  }

  const changedFields = input.impact.base.touchedFields
  if (changedFields === 'all') {
    return 'sync'
  }

  if (
    commitImpact.has.recordSetChange(commit)
    || hasIntersection(new Set(input.plan.watch.filter), changedFields)
    || hasIntersection(new Set(input.plan.watch.sort), changedFields)
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

export const runQueryStage = (input: {
  reader: DocumentReader
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
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
  const stage = runSnapshotStage({
    action,
    previousState: input.previous,
    previousPublished: input.previousPublished,
    derive: () => action === 'reuse' && input.previous
      ? input.previous
      : buildQueryState({
          reader: input.reader,
          view: input.view,
          index: input.index,
          plan: input.plan,
          previous: input.previous
        }),
    canReusePublished: stageInput => (
      stageInput.state === input.previous
      && stageInput.previousPublished !== undefined
    ),
    publish: state => (
      input.previousPublished
      && input.previousPublished.matched === state.records.matched
      && input.previousPublished.ordered === state.records.ordered
      && input.previousPublished.visible === state.records.visible
        ? input.previousPublished
        : state.records
    )
  })

  let changedRecordCount = 0
  let delta: QueryDelta = {
    rebuild: stage.action === 'rebuild',
    added: EMPTY_RECORD_IDS,
    removed: EMPTY_RECORD_IDS,
    orderChanged: false
  }
  if (stage.action === 'rebuild') {
    ensureQueryImpact(input.impact).rebuild = true
    delta = {
      rebuild: true,
      added: stage.state.records.visible,
      removed: EMPTY_RECORD_IDS,
      orderChanged: false
    }
  } else if (stage.action === 'sync' && input.previous) {
    const previousRecords = input.previous.records
    const nextRecords = stage.state.records
    const orderChanged = previousRecords.ordered !== nextRecords.ordered
    const diff = collectVisibleDiff({
      previous: previousRecords.visible,
      next: nextRecords.visible,
      previousSet: previousRecords.visible.length <= nextRecords.visible.length
        ? readQueryVisibleSet(input.previous)
        : input.previous.visibleSet,
      nextSet: nextRecords.visible.length < previousRecords.visible.length
        ? readQueryVisibleSet(stage.state)
        : stage.state.visibleSet
    })

    if (
      diff.added.length
      || diff.removed.length
      || orderChanged
    ) {
      changedRecordCount = diff.added.length + diff.removed.length
      const queryImpact = ensureQueryImpact(input.impact)
      if (diff.added.length) {
        queryImpact.visibleAdded.push(...diff.added)
      }
      if (diff.removed.length) {
        queryImpact.visibleRemoved.push(...diff.removed)
      }
      if (orderChanged) {
        queryImpact.orderChanged = true
      }
    }
    delta = {
      rebuild: false,
      added: diff.added,
      removed: diff.removed,
      orderChanged
    }
  }

  console.log('[dv-summary-debug][query]', {
    action: stage.action,
    delta,
    queryImpact: input.impact.query
      ? {
          rebuild: input.impact.query.rebuild === true,
          visibleAdded: input.impact.query.visibleAdded.length,
          visibleRemoved: input.impact.query.visibleRemoved.length,
          orderChanged: input.impact.query.orderChanged === true
        }
      : undefined,
    visibleCount: {
      previous: input.previousPublished?.visible.length,
      next: stage.published.visible.length
    }
  })

  return {
    action: stage.action,
    state: stage.state,
    delta,
    records: stage.published,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs,
    metrics: {
      inputCount: input.previousPublished?.visible.length,
      outputCount: stage.published.visible.length,
      reusedNodeCount: (
        (input.previousPublished?.matched === stage.published.matched ? 1 : 0)
        + (input.previousPublished?.ordered === stage.published.ordered ? 1 : 0)
        + (input.previousPublished?.visible === stage.published.visible ? 1 : 0)
      ),
      rebuiltNodeCount: (
        3 - (
          (input.previousPublished?.matched === stage.published.matched ? 1 : 0)
          + (input.previousPublished?.ordered === stage.published.ordered ? 1 : 0)
          + (input.previousPublished?.visible === stage.published.visible ? 1 : 0)
        )
      ),
      changedRecordCount
    }
  }
}
