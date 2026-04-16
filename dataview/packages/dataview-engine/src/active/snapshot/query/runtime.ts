import type {
  CommitImpact,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  collectTouchedFieldIds,
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

const resolveQueryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: CommitImpact
  view: View
  previous?: QueryState
}): DeriveAction => {
  const hasSearchQuery = Boolean(trimToUndefined(input.view.search.query))

  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(input.impact)
  ) {
    return 'rebuild'
  }

  if (hasViewQueryImpact(input.impact, input.activeViewId, ['search', 'filter', 'sort', 'order'])) {
    return 'sync'
  }

  const queryFields = {
    search: viewSearchFields(input.view),
    filter: viewFilterFields(input.view),
    sort: viewSortFields(input.view)
  }

  for (const fieldId of queryFields.filter) {
    if (hasFieldSchemaAspect(input.impact, fieldId)) {
      return 'sync'
    }
  }
  for (const fieldId of queryFields.sort) {
    if (hasFieldSchemaAspect(input.impact, fieldId)) {
      return 'sync'
    }
  }

  const changedFields = collectTouchedFieldIds(input.impact, {
    includeTitlePatch: true
  })
  if (changedFields === 'all') {
    return 'sync'
  }

  if (hasSearchQuery) {
    for (const fieldId of changedFields) {
      if (hasFieldSchemaAspect(input.impact, fieldId)) {
        return 'sync'
      }
    }
  }

  if (
    hasRecordSetChange(input.impact)
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
  impact: CommitImpact
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
    publish: state => (
      input.previousPublished
      && input.previousPublished.matched === state.records.matched
      && input.previousPublished.ordered === state.records.ordered
      && input.previousPublished.visible === state.records.visible
        ? input.previousPublished
        : state.records
    )
  })

  return {
    action: stage.action,
    state: stage.state,
    records: stage.published,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs
  }
}
