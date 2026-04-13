import type {
  CommitDelta,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  IndexState
} from '../../index/types'
import {
  collectTouchedRecordIds
} from '../../index/shared'
import {
  now
} from '../../../runtime/clock'
import type {
  DeriveAction,
  QueryState,
  SectionState
} from '../../../contracts/internal'
import {
  publishSections
} from './publish'
export {
  syncSectionState
} from './sync'
import {
  syncSectionState
} from './sync'

const resolveSectionsAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  delta: CommitDelta
  view: View
  previous?: SectionState
  previousQuery?: QueryState
  query: QueryState
}): DeriveAction => {
  if (
    !input.previous
    || !input.previousQuery
    || input.previousViewId !== input.activeViewId
    || input.delta.semantics.some(item => item.kind === 'activeView.set')
  ) {
    return 'rebuild'
  }

  if (
    input.previousQuery.visible !== input.query.visible
    || input.previousQuery.ordered !== input.query.ordered
  ) {
    return 'rebuild'
  }

  const groupField = input.view.group?.field
  if (!groupField) {
    return 'reuse'
  }

  for (const item of input.delta.semantics) {
    switch (item.kind) {
      case 'view.query':
        if (item.viewId === input.activeViewId && item.aspects.includes('group')) {
          return 'rebuild'
        }
        break
      case 'field.schema':
        if (item.fieldId === groupField) {
          return 'rebuild'
        }
        break
      case 'record.add':
      case 'record.remove':
        return 'rebuild'
      case 'record.patch':
        break
      case 'record.values':
        if (item.fields === 'all' || item.fields.includes(groupField)) {
          return 'sync'
        }
        break
      default:
        break
    }
  }

  return 'reuse'
}

export const runSectionsStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  delta: CommitDelta
  view: View
  query: QueryState
  previous?: SectionState
  previousQuery?: QueryState
  previousPublished: {
    sections?: import('../../../contracts/public').SectionList
    items?: import('../../../contracts/public').ItemList
  }
  index: IndexState
}): {
  action: DeriveAction
  state: SectionState
  sections: import('../../../contracts/public').SectionList
  items: import('../../../contracts/public').ItemList
  deriveMs: number
  publishMs: number
} => {
  const touchedRecords = collectTouchedRecordIds(input.delta)
  const action = resolveSectionsAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    delta: input.delta,
    view: input.view,
    previous: input.previous,
    previousQuery: input.previousQuery,
    query: input.query
  })
  const deriveStart = now()
  const state = syncSectionState({
    previous: input.previous,
    previousQuery: input.previousQuery,
    view: input.view,
    query: input.query,
    index: input.index,
    touchedRecords,
    action
  })
  const deriveMs = now() - deriveStart

  if (
    action === 'reuse'
    && state === input.previous
    && input.previousPublished.sections
    && input.previousPublished.items
  ) {
    return {
      action,
      state,
      sections: input.previousPublished.sections,
      items: input.previousPublished.items,
      deriveMs,
      publishMs: 0
    }
  }

  const publishStart = now()
  const published = publishSections({
    sections: state,
    previousSections: input.previous,
    previous: {
      items: input.previousPublished.items,
      sections: input.previousPublished.sections
    }
  })
  const publishMs = now() - publishStart

  return {
    action,
    state,
    sections: published.sections,
    items: published.items,
    deriveMs,
    publishMs
  }
}
