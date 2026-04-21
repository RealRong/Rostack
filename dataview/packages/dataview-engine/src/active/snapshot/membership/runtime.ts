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
  type ActiveImpact
} from '@dataview/engine/active/shared/impact'
import type {
  DeriveAction,
  ItemProjectionCache,
  MembershipDelta,
  MembershipRuntimeState,
  MembershipState,
  QueryState,
} from '@dataview/engine/contracts/state'
import type {
  SectionKey,
  ViewStageMetrics
} from '@dataview/engine/contracts'
import {
  syncItemProjection
} from '@dataview/engine/active/snapshot/membership/publish'
import {
  syncMembershipState
} from '@dataview/engine/active/snapshot/membership/sync'
import { now } from '@dataview/engine/runtime/clock'

const EMPTY_MEMBERSHIP_DELTA: MembershipDelta = {
  rebuild: false,
  orderChanged: false,
  removed: [],
  changed: [],
  records: new Map()
}

const resolveMembershipAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  previous?: MembershipState
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

const buildMembershipDelta = (input: {
  previous?: MembershipState
  next: MembershipState
  records: MembershipDelta['records']
  action: DeriveAction
}): MembershipDelta => {
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
      changed: nextKeys,
      records: input.records
    }
  }

  const changed = new Set<SectionKey>()
  input.records.forEach(({ before, after }) => {
    before.forEach(sectionKey => {
      changed.add(sectionKey)
    })
    after.forEach(sectionKey => {
      changed.add(sectionKey)
    })
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
    changed: [...changed],
    records: input.records
  }
}

const resolveProjection = (input: {
  activeViewId: ViewId
  view: View
  previous?: ItemProjectionCache
  impact: ActiveImpact
}): 'reuse' | 'sync' => {
  const mode = input.view.group
    ? 'grouped'
    : 'root'
  const previous = input.previous

  if (!previous || previous.mode !== mode || input.impact.base.recordSetChanged) {
    return 'sync'
  }

  if (mode === 'root') {
    return 'reuse'
  }

  const groupField = input.view.group?.field
  const touchedFields = input.impact.base.touchedFields
  if (
    commitImpact.has.viewQuery(input.impact.commit, input.activeViewId, ['group'])
    || (groupField !== undefined && commitImpact.has.fieldSchema(input.impact.commit, groupField))
    || touchedFields === 'all'
    || (groupField !== undefined && touchedFields.has(groupField))
  ) {
    return 'sync'
  }

  return 'reuse'
}

const deriveMembershipState = (input: {
  activeViewId: ViewId
  action: DeriveAction
  view: View
  query: QueryState
  previous?: MembershipRuntimeState
  previousStructure?: MembershipState
  impact: ActiveImpact
  index: IndexState
}): {
  state: MembershipRuntimeState
  delta: MembershipDelta
} => {
  if (input.action === 'reuse' && input.previous) {
    return {
      state: input.previous,
      delta: EMPTY_MEMBERSHIP_DELTA
    }
  }

  const synced = syncMembershipState({
    previous: input.previousStructure,
    view: input.view,
    query: input.query,
    index: input.index,
    impact: input.impact,
    action: input.action
  })
  const delta = buildMembershipDelta({
    previous: input.previousStructure,
    next: synced.state,
    records: synced.records,
    action: input.action
  })
  const projectionAction = resolveProjection({
    activeViewId: input.activeViewId,
    view: input.view,
    previous: input.previous?.projection,
    impact: input.impact
  })

  return {
    state: {
      structure: synced.state,
      projection: projectionAction === 'reuse' && input.previous?.projection
        ? input.previous.projection
        : syncItemProjection({
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

export const runMembershipStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  query: QueryState
  previous?: MembershipRuntimeState
  index: IndexState
}): {
  action: DeriveAction
  state: MembershipRuntimeState
  delta: MembershipDelta
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
  const previousStructure = input.previous?.structure
  const action = resolveMembershipAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    previous: previousStructure,
    query: input.query
  })
  const deriveStart = now()
  const derived = deriveMembershipState({
    activeViewId: input.activeViewId,
    action,
    view: input.view,
    query: input.query,
    previous: input.previous,
    previousStructure,
    impact: input.impact,
    index: input.index
  })
  const deriveMs = now() - deriveStart
  const outputCount = derived.state.structure.byKey.size
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
    deriveMs,
    publishMs: 0,
    metrics: {
      inputCount: previousStructure?.byKey.size,
      outputCount,
      reusedNodeCount,
      rebuiltNodeCount: outputCount - reusedNodeCount,
      changedSectionCount
    }
  }
}
