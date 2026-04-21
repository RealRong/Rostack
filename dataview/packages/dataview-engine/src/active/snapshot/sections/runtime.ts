import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { equal } from '@shared/core'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  createBucketSpec,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
import {
  hasMembershipChanges,
  hasQueryChanges,
  membershipRead,
  type ActiveImpact
} from '@dataview/engine/active/shared/impact'
import type {
  DeriveAction,
  QueryState,
  SectionDelta,
  SectionRuntimeState,
  SectionState
} from '@dataview/engine/contracts/state'
import type {
  ItemList,
  SectionKey,
  SectionList,
  ViewStageMetrics
} from '@dataview/engine/contracts'
import {
  publishSections,
  syncItemProjection
} from '@dataview/engine/active/snapshot/sections/publish'
import {
  syncSectionState
} from '@dataview/engine/active/snapshot/sections/sync'
import { now } from '@dataview/engine/runtime/clock'

const EMPTY_SECTION_DELTA: SectionDelta = {
  rebuild: false,
  orderChanged: false,
  removed: [],
  changed: []
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
    || commitImpact.has.activeView(commit)
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
    commitImpact.has.viewQuery(commit, input.activeViewId, ['group'])
    || commitImpact.has.fieldSchema(commit, groupField)
    || commitImpact.has.recordSetChange(commit)
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

const buildSectionDelta = (input: {
  previous?: SectionState
  next: SectionState
  impact: ActiveImpact
  action: DeriveAction
}): SectionDelta => {
  const nextKeys = input.next.order.filter(sectionKey => input.next.byKey.has(sectionKey))
  const previousKeys = input.previous
    ? [...input.previous.byKey.keys()]
    : []
  const removed = previousKeys.filter(sectionKey => !input.next.byKey.has(sectionKey))
  const rebuild = input.action === 'rebuild'
  const orderChanged = !equal.sameOrder(input.previous?.order ?? [], input.next.order)

  if (rebuild) {
    return {
      rebuild: true,
      orderChanged,
      removed,
      changed: nextKeys
    }
  }

  const changed = new Set<SectionKey>()
  membershipRead.keyChanges(input.impact.section).touched.forEach(sectionKey => {
    changed.add(sectionKey)
  })
  nextKeys.forEach(sectionKey => {
    const previousNode = input.previous?.byKey.get(sectionKey)
    const nextNode = input.next.byKey.get(sectionKey)
    if (nextNode && previousNode !== nextNode) {
      changed.add(sectionKey)
    }
  })

  return {
    rebuild: false,
    orderChanged,
    removed,
    changed: [...changed]
  }
}

const deriveSectionsState = (input: {
  action: DeriveAction
  view: View
  query: QueryState
  previous?: SectionRuntimeState
  previousStructure?: SectionState
  impact: ActiveImpact
  index: IndexState
}): {
  state: SectionRuntimeState
  delta: SectionDelta
} => {
  if (input.action === 'reuse' && input.previous) {
    return {
      state: input.previous,
      delta: EMPTY_SECTION_DELTA
    }
  }

  const structure = syncSectionState({
    previous: input.previousStructure,
    view: input.view,
    query: input.query,
    index: input.index,
    impact: input.impact,
    action: input.action
  })
  const delta = buildSectionDelta({
    previous: input.previousStructure,
    next: structure,
    impact: input.impact,
    action: input.action
  })

  return {
    state: {
      structure,
      projection: syncItemProjection({
        mode: input.view.group
          ? 'grouped'
          : 'root',
        previous: input.previous?.projection,
        allRecordIds: input.index.records.ids,
        ...(input.view.group
          ? {
              sectionKeysByRecord: readBucketIndex(
                input.index.bucket,
                createBucketSpec(input.view.group)
              )?.keysByRecord
            }
          : {})
      })
    },
    delta
  }
}

export const runSectionsStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  query: QueryState
  previous?: SectionRuntimeState
  previousPublished: {
    sections?: SectionList
    items?: ItemList
  }
  index: IndexState
}): {
  action: DeriveAction
  state: SectionRuntimeState
  delta: SectionDelta
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
        items: input.previousPublished.items
      }
    : undefined
  const previousStructure = input.previous?.structure
  const action = resolveSectionsAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    previous: previousStructure,
    query: input.query
  })
  const deriveStart = now()
  const derived = deriveSectionsState({
    action,
    view: input.view,
    query: input.query,
    previous: input.previous,
    previousStructure,
    impact: input.impact,
    index: input.index
  })
  const deriveMs = now() - deriveStart
  const canReusePublished = (
    derived.state === input.previous
    && previousPublished !== undefined
  )
  const publishStart = canReusePublished
    ? 0
    : now()
  const published = canReusePublished
    ? previousPublished
    : publishSections({
        sections: derived.state.structure,
        projection: derived.state.projection,
        previousSections: previousStructure,
        previous: previousPublished
      })
  const publishMs = canReusePublished
    ? 0
    : now() - publishStart

  const outputCount = published.sections.all.length
  const changedSectionCount = action === 'reuse'
    ? 0
    : derived.delta.rebuild
      ? outputCount
      : Math.min(outputCount, derived.delta.changed.length + derived.delta.removed.length)
  const reusedNodeCount = Math.max(0, outputCount - changedSectionCount)

  return {
    action,
    state: derived.state,
    delta: derived.delta,
    sections: published.sections,
    items: published.items,
    deriveMs,
    publishMs,
    metrics: {
      inputCount: input.previousPublished.sections?.all.length,
      outputCount,
      reusedNodeCount,
      rebuiltNodeCount: outputCount - reusedNodeCount,
      changedSectionCount
    }
  }
}
