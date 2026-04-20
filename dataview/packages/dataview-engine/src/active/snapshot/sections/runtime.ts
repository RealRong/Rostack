import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemList,
  SectionKey,
  SectionList,
  ViewStageMetrics
} from '@dataview/engine/contracts/public'
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
  ItemProjectionCache,
  QueryState,
  SectionState
} from '@dataview/engine/contracts/internal'
import {
  createBucketSpec,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
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

export interface SectionStageDelta {
  rebuild: boolean
  changed: readonly SectionKey[]
  removed: readonly SectionKey[]
}

const resolveSectionsAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  previous?: SectionState
  query: QueryState
}): DeriveAction => {
  const commit = input.impact.commit

  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(commit)
  ) {
    return 'rebuild'
  }

  if (input.impact.query?.rebuild || input.impact.bucket?.rebuild) {
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

  return hasQueryChanges(input.impact) || hasMembershipChanges(input.impact.bucket)
    ? 'sync'
    : 'reuse'
}

export const runSectionsStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  query: QueryState
  previous?: SectionState
  previousPublished: {
    sections?: SectionList
    items?: ItemList
  }
  previousProjection: ItemProjectionCache
  index: IndexState
}): {
  action: DeriveAction
  state: SectionState
  delta: SectionStageDelta
  projection: ItemProjectionCache
  sections: SectionList
  items: ItemList
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
  const previousPublished = input.previousPublished.sections
    && input.previousPublished.items
    ? {
        sections: input.previousPublished.sections,
        items: input.previousPublished.items,
        projection: input.previousProjection
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
      mode: input.view.group
        ? 'grouped'
        : 'root',
      sections: state,
      previousSections: input.previous,
      previousProjection: input.previousProjection,
      allRecordIds: input.index.records.ids,
      ...(input.view.group
        ? {
            sectionMembership: readBucketIndex(input.index.bucket, createBucketSpec(input.view.group))?.recordsByKey
          }
        : {}),
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

  const outputCount = stage.published.sections.all.length
  const nextSectionKeys = stage.state.order.filter(sectionKey => stage.state.byKey.has(sectionKey))
  const previousSectionKeys = input.previous
    ? [...input.previous.byKey.keys()]
    : []
  const removed = previousSectionKeys.filter(sectionKey => !stage.state.byKey.has(sectionKey))
  const changed = stage.action === 'rebuild'
    ? nextSectionKeys
    : [...new Set([
        ...(input.impact.sections?.touchedKeys ?? []),
        ...(!sameOrder(input.previous?.order ?? [], stage.state.order)
          ? nextSectionKeys
          : [])
      ])]
  const changedSectionCount = stage.action === 'reuse'
    ? 0
    : stage.action === 'rebuild'
      ? outputCount
      : Math.min(
          outputCount,
          input.impact.sections?.touchedKeys.size
            ?? (input.previousPublished.sections === stage.published.sections ? 0 : 1)
        )
  const reusedNodeCount = Math.max(0, outputCount - changedSectionCount)

  return {
    action: stage.action,
    state: stage.state,
    delta: {
      rebuild: stage.action === 'rebuild',
      changed,
      removed
    },
    projection: stage.published.projection,
    sections: stage.published.sections,
    items: stage.published.items,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs,
    metrics: {
      inputCount: input.previousPublished.sections?.all.length,
      outputCount,
      reusedNodeCount,
      rebuiltNodeCount: outputCount - reusedNodeCount,
      changedSectionCount
    }
  }
}
