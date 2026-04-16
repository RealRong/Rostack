import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import {
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
  ItemIdentityCache,
  SectionState
} from '@dataview/engine/contracts/internal'
import { runSnapshotStage } from '@dataview/engine/active/snapshot/stage'
import {
  hasMembershipChanges,
  hasQueryChanges
} from '@dataview/engine/active/shared/impact'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
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
  impact: ActiveImpact
  view: View
  previous?: SectionState
  query: import('@dataview/engine/contracts/internal').QueryState
}): DeriveAction => {
  const commit = input.impact.commit

  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(commit)
  ) {
    return 'rebuild'
  }

  if (input.impact.query?.rebuild || input.impact.group?.rebuild) {
    return 'rebuild'
  }

  const groupField = input.view.group?.field
  if (!groupField) {
    return hasQueryChanges(input.impact)
      ? 'sync'
      : 'reuse'
  }

  if (
    hasViewQueryImpact(commit, input.activeViewId, ['group'])
    || hasFieldSchemaAspect(commit, groupField)
    || hasRecordSetChange(commit)
  ) {
    return 'rebuild'
  }

  const touchedFields = input.impact.base.touchedFields
  if (touchedFields === 'all' || touchedFields.has(groupField)) {
    return 'sync'
  }

  return hasQueryChanges(input.impact) || hasMembershipChanges(input.impact.group)
    ? 'sync'
    : 'reuse'
}

export const runSectionsStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  query: import('@dataview/engine/contracts/internal').QueryState
  previous?: SectionState
  previousPublished: {
    sections?: import('@dataview/engine/contracts/public').SectionList
    items?: import('@dataview/engine/contracts/public').ItemList
  }
  previousIdentity: ItemIdentityCache
  index: IndexState
}): {
  action: DeriveAction
  state: SectionState
  identity: ItemIdentityCache
  sections: import('@dataview/engine/contracts/public').SectionList
  items: import('@dataview/engine/contracts/public').ItemList
  deriveMs: number
  publishMs: number
} => {
  const previousPublished = input.previousPublished.sections
    && input.previousPublished.items
    ? {
        sections: input.previousPublished.sections,
        items: input.previousPublished.items,
        identity: input.previousIdentity
      }
    : undefined
  const action = resolveSectionsAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    previous: input.previous,
    query: input.query
  })
  const stage = runSnapshotStage({
    action,
    previousState: input.previous,
    previousPublished,
    derive: () => syncSectionState({
      previous: input.previous,
      view: input.view,
      query: input.query,
      index: input.index,
      impact: input.impact,
      action
    }),
    publish: state => publishSections({
      sections: state,
      previousSections: input.previous,
      previousIdentity: input.previousIdentity,
      previous: {
        items: previousPublished?.items,
        sections: previousPublished?.sections
      }
    }),
    canReusePublished: stageInput => (
      stageInput.state === input.previous
      && stageInput.previousPublished !== undefined
    )
  })

  return {
    action: stage.action,
    state: stage.state,
    identity: stage.published.identity,
    sections: stage.published.sections,
    items: stage.published.items,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs
  }
}
