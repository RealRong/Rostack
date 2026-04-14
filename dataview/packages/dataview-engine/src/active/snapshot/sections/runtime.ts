import type {
  CommitDelta,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  collectTouchedRecordIds
} from '@dataview/engine/active/index/shared'
import type {
  DeriveAction,
  QueryState,
  SectionState
} from '@dataview/engine/contracts/internal'
import { runSnapshotStage } from '@dataview/engine/active/snapshot/stage'
import {
  publishSections
} from '@dataview/engine/active/snapshot/sections/publish'
export {
  syncSectionState
} from '@dataview/engine/active/snapshot/sections/sync'
import {
  syncSectionState
} from '@dataview/engine/active/snapshot/sections/sync'

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
    input.previousQuery.records.visible !== input.query.records.visible
    || input.previousQuery.records.ordered !== input.query.records.ordered
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
    sections?: import('@dataview/engine/contracts/public').SectionList
    items?: import('@dataview/engine/contracts/public').ItemList
  }
  index: IndexState
}): {
  action: DeriveAction
  state: SectionState
  sections: import('@dataview/engine/contracts/public').SectionList
  items: import('@dataview/engine/contracts/public').ItemList
  deriveMs: number
  publishMs: number
} => {
  const previousPublished = input.previousPublished.sections
    && input.previousPublished.items
    ? {
        sections: input.previousPublished.sections,
        items: input.previousPublished.items
      }
    : undefined
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
  const stage = runSnapshotStage({
    action,
    previousState: input.previous,
    previousPublished,
    derive: () => syncSectionState({
      previous: input.previous,
      previousQuery: input.previousQuery,
      view: input.view,
      query: input.query,
      index: input.index,
      touchedRecords,
      action
    }),
    publish: state => publishSections({
      sections: state,
      previousSections: input.previous,
      previous: {
        items: previousPublished?.items,
        sections: previousPublished?.sections
      }
    }),
    canReusePublished: stageInput => (
      stageInput.action === 'reuse'
      && stageInput.state === input.previous
      && stageInput.previousPublished !== undefined
    )
  })

  return {
    action: stage.action,
    state: stage.state,
    sections: stage.published.sections,
    items: stage.published.items,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs
  }
}
