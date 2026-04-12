import type {
  CommitDelta,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  trimToUndefined
} from '@shared/core'
import {
  viewFilterFields,
  viewSearchFields,
  viewSortFields
} from '@dataview/core/view'
import {
  collectValueFieldIds
} from '../../../index/shared'
import type {
  IndexState
} from '../../../index/types'
import type {
  ProjectState,
  ProjectionAction,
  QueryState
} from '../state'
import {
  publishRecordSet
} from '../../publish/records'
export {
  buildQueryState
} from './derive'
import {
  buildQueryState
} from './derive'

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
  delta: CommitDelta
  view: View
  previous?: QueryState
}): ProjectionAction => {
  const hasSearchQuery = Boolean(trimToUndefined(input.view.search.query))

  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || input.delta.semantics.some(item => item.kind === 'activeView.set')
  ) {
    return 'rebuild'
  }

  const queryFields = {
    search: viewSearchFields(input.view),
    filter: viewFilterFields(input.view),
    sort: viewSortFields(input.view)
  }

  let action: ProjectionAction = 'reuse'

  for (const item of input.delta.semantics) {
    switch (item.kind) {
      case 'view.query':
        if (
          item.viewId === input.activeViewId
          && (
            item.aspects.includes('search')
            || item.aspects.includes('filter')
            || item.aspects.includes('sort')
            || item.aspects.includes('order')
          )
        ) {
          return 'sync'
        }
        break
      case 'field.schema': {
        const changedField = item.fieldId
        if (
          queryFields.filter.has(changedField)
          || queryFields.sort.has(changedField)
          || (
            hasSearchQuery
            && queryUsesChangedFields(queryFields.search, new Set([changedField]))
          )
        ) {
          return 'sync'
        }
        break
      }
      case 'record.add':
      case 'record.remove':
        return 'sync'
      case 'record.patch': {
        const changedFields = new Set<FieldId>(
          item.aspects.includes('title')
            ? [TITLE_FIELD_ID]
            : []
        )
        if (
          changedFields.size > 0
          && (
            hasIntersection(queryFields.filter, changedFields)
            || hasIntersection(queryFields.sort, changedFields)
            || (
              hasSearchQuery
              && queryUsesChangedFields(queryFields.search, changedFields)
            )
          )
        ) {
          return 'sync'
        }
        break
      }
      case 'record.values': {
        const changedFields = item.fields === 'all'
          ? 'all'
          : new Set(item.fields)
        if (
          changedFields === 'all'
          || (
            changedFields.size > 0
            && (
              hasIntersection(queryFields.filter, changedFields)
              || hasIntersection(queryFields.sort, changedFields)
              || (
                hasSearchQuery
                && queryUsesChangedFields(queryFields.search, changedFields)
              )
            )
          )
        ) {
          return 'sync'
        }
        break
      }
      default:
        break
    }
  }

  if (collectValueFieldIds(input.delta, { includeTitlePatch: true }).size > 0) {
    action = 'reuse'
  }

  return action
}

export const runQueryStage = (input: {
  document: import('@dataview/core/contracts').DataDoc
  activeViewId: ViewId
  previousViewId?: ViewId
  delta: CommitDelta
  view: View
  index: IndexState
  previous?: QueryState
  previousPublished?: ProjectState['records']
}): {
  action: ProjectionAction
  state: QueryState
  records: ProjectState['records']
} => {
  const action = resolveQueryAction(input)
  const state = action === 'reuse' && input.previous
    ? input.previous
    : buildQueryState({
        document: input.document,
        view: input.view,
        index: input.index,
        previous: input.previous
      })

  return {
    action,
    state,
    records: publishRecordSet({
      activeViewId: input.activeViewId,
      query: state,
      previous: input.previousPublished
    })
  }
}
