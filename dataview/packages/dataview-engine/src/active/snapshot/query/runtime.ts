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
  now
} from '#engine/runtime/clock.ts'
import {
  viewFilterFields,
  viewSearchFields,
  viewSortFields
} from '@dataview/core/view'
import {
  collectValueFieldIds
} from '#engine/active/index/shared.ts'
import type {
  IndexState
} from '#engine/active/index/contracts.ts'
import type {
  DeriveAction,
  QueryState
} from '#engine/contracts/internal.ts'
export {
  buildQueryState
} from '#engine/active/snapshot/query/derive.ts'
import {
  buildQueryState
} from '#engine/active/snapshot/query/derive.ts'

const publishViewRecords = (input: {
  query: QueryState
  previous?: import('#engine/contracts/public.ts').ViewRecords
}): import('#engine/contracts/public.ts').ViewRecords => {
  const previous = input.previous
  return previous
    && previous.matched === input.query.matched
    && previous.ordered === input.query.ordered
    && previous.visible === input.query.visible
    ? previous
    : {
        matched: input.query.matched,
        ordered: input.query.ordered,
        visible: input.query.visible
      }
}

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
}): DeriveAction => {
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

  let action: DeriveAction = 'reuse'

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
  previousPublished?: import('#engine/contracts/public.ts').ViewRecords
}): {
  action: DeriveAction
  state: QueryState
  records: import('#engine/contracts/public.ts').ViewRecords
  deriveMs: number
  publishMs: number
} => {
  const action = resolveQueryAction(input)
  const deriveStart = now()
  const state = action === 'reuse' && input.previous
    ? input.previous
    : buildQueryState({
        document: input.document,
        view: input.view,
        index: input.index,
        previous: input.previous
      })
  const deriveMs = now() - deriveStart

  if (
    action === 'reuse'
    && state === input.previous
    && input.previousPublished
  ) {
    return {
      action,
      state,
      records: input.previousPublished,
      deriveMs,
      publishMs: 0
    }
  }

  const publishStart = now()
  const records = publishViewRecords({
    query: state,
    previous: input.previousPublished
  })
  const publishMs = now() - publishStart

  return {
    action,
    state,
    records,
    deriveMs,
    publishMs
  }
}
