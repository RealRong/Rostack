import type {
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  hasActiveViewImpact,
  hasFieldSchemaAspect,
  hasRecordSetChange,
  hasViewQueryImpact
} from '@dataview/core/commit/impact'
import {
  trimToUndefined
} from '@shared/core'
import {
  viewFilterFields,
  viewSearchFields,
  viewSortFields
} from '@dataview/core/view'
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
  QueryState
} from '@dataview/engine/contracts/internal'
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
  fields: ReadonlySet<FieldId> | 'all',
  changedFields: ReadonlySet<FieldId>
) => fields === 'all'
  ? changedFields.size > 0
  : hasIntersection(fields, changedFields)

const EMPTY_RECORD_IDS = [] as RecordId[]
const EMPTY_VISIBLE_DIFF = {
  added: EMPTY_RECORD_IDS,
  removed: EMPTY_RECORD_IDS
} as const

const collectVisibleDiff = (input: {
  previous: readonly RecordId[]
  next: readonly RecordId[]
}): {
  added: RecordId[]
  removed: RecordId[]
} => {
  if (input.previous === input.next) {
    return EMPTY_VISIBLE_DIFF
  }

  const remainingPrevious = new Set(input.previous)
  const added: RecordId[] = []
  input.next.forEach(recordId => {
    if (!remainingPrevious.delete(recordId)) {
      added.push(recordId)
    }
  })
  const removed = remainingPrevious.size
    ? [...remainingPrevious]
    : EMPTY_RECORD_IDS

  return {
    added,
    removed
  }
}

const resolveQueryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  previous?: QueryState
}): DeriveAction => {
  const hasSearchQuery = Boolean(trimToUndefined(input.view.search.query))
  const commit = input.impact.commit

  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(commit)
  ) {
    return 'rebuild'
  }

  if (hasViewQueryImpact(commit, input.activeViewId, ['search', 'filter', 'sort', 'order'])) {
    return 'sync'
  }

  const queryFields = {
    search: viewSearchFields(input.view),
    filter: viewFilterFields(input.view),
    sort: viewSortFields(input.view)
  }

  for (const fieldId of queryFields.filter) {
    if (hasFieldSchemaAspect(commit, fieldId)) {
      return 'sync'
    }
  }
  for (const fieldId of queryFields.sort) {
    if (hasFieldSchemaAspect(commit, fieldId)) {
      return 'sync'
    }
  }

  const changedFields = input.impact.base.touchedFields
  if (changedFields === 'all') {
    return 'sync'
  }

  if (hasSearchQuery) {
    for (const fieldId of changedFields) {
      if (hasFieldSchemaAspect(commit, fieldId)) {
        return 'sync'
      }
    }
  }

  if (
    hasRecordSetChange(commit)
    || hasIntersection(queryFields.filter, changedFields)
    || hasIntersection(queryFields.sort, changedFields)
    || (
      hasSearchQuery
      && queryUsesChangedFields(queryFields.search, changedFields)
    )
  ) {
    return 'sync'
  }

  return 'reuse'
}

export const runQueryStage = (input: {
  reader: import('@dataview/engine/document/reader').DocumentReader
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  index: IndexState
  previous?: QueryState
  previousPublished?: import('@dataview/engine/contracts/public').ViewRecords
}): {
  action: DeriveAction
  state: QueryState
  records: import('@dataview/engine/contracts/public').ViewRecords
  deriveMs: number
  publishMs: number
} => {
  const action = resolveQueryAction(input)
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

  if (stage.action === 'rebuild') {
    ensureQueryImpact(input.impact).rebuild = true
  } else if (stage.action === 'sync' && input.previous) {
    const previousRecords = input.previous.records
    const nextRecords = stage.state.records
    const orderChanged = previousRecords.ordered !== nextRecords.ordered
    const diff = (
      !input.impact.base.recordSetChanged
      && previousRecords.visible === previousRecords.ordered
      && nextRecords.visible === nextRecords.ordered
      && previousRecords.visible.length === nextRecords.visible.length
    )
      ? EMPTY_VISIBLE_DIFF
      : collectVisibleDiff({
          previous: previousRecords.visible,
          next: nextRecords.visible
        })

    if (
      diff.added.length
      || diff.removed.length
      || orderChanged
    ) {
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
  }

  return {
    action: stage.action,
    state: stage.state,
    records: stage.published,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs
  }
}
