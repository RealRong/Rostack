import type {
  CommitImpact,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  collectTouchedFieldIds,
  collectTouchedRecordIds,
  hasActiveViewImpact,
  hasFieldSchemaAspect,
  hasRecordSetChange,
  hasViewQueryImpact
} from '@dataview/core/commit/impact'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
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
  impact: CommitImpact
  view: View
  previous?: SectionState
  previousQuery?: QueryState
  query: QueryState
}): DeriveAction => {
  if (
    !input.previous
    || !input.previousQuery
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(input.impact)
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

  if (
    hasViewQueryImpact(input.impact, input.activeViewId, ['group'])
    || hasFieldSchemaAspect(input.impact, groupField)
    || hasRecordSetChange(input.impact)
  ) {
    return 'rebuild'
  }

  const touchedFields = collectTouchedFieldIds(input.impact, {
    includeTitlePatch: true
  })
  if (touchedFields === 'all' || touchedFields.has(groupField)) {
    return 'sync'
  }

  return 'reuse'
}

export const runSectionsStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: CommitImpact
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
  const touchedRecords = collectTouchedRecordIds(input.impact)
  const action = resolveSectionsAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
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
