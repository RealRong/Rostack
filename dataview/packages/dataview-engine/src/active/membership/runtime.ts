import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import {
  syncMembershipState
} from '@dataview/engine/active/membership/derive'
import {
  resolveMembershipAction
} from '@dataview/engine/active/projector/policy'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA
} from '@dataview/engine/active/state'
import type {
  MembershipPhaseDelta as MembershipDelta,
  MembershipPhaseState as MembershipState,
  PhaseAction as DeriveAction,
  QueryPhaseDelta as QueryDelta,
  QueryPhaseState as QueryState,
} from '@dataview/engine/active/state'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts/performance'
import type {
  SectionId
} from '@dataview/engine/contracts/shared'
import { now } from '@dataview/engine/runtime/clock'

const buildMembershipDelta = (input: {
  previous?: MembershipState
  next: MembershipState
  records: MembershipDelta['records']
  action: DeriveAction
}): MembershipDelta => {
  const nextKeys = input.next.sections.order.filter(sectionId => input.next.sections.get(sectionId))
  const previousKeys = input.previous?.sections.order ?? []
  const removed = previousKeys.filter(sectionId => !input.next.sections.get(sectionId))
  const rebuild = input.action === 'rebuild'
  const orderChanged = !equal.sameOrder(previousKeys, input.next.sections.order)

  if (rebuild) {
    return {
      rebuild: true,
      orderChanged,
      removed,
      changed: nextKeys,
      records: input.records
    }
  }

  const changed = new Set<SectionId>()
  input.records.forEach(({ before, after }) => {
    before.forEach(sectionId => {
      changed.add(sectionId)
    })
    after.forEach(sectionId => {
      changed.add(sectionId)
    })
  })
  nextKeys.forEach(sectionId => {
    const previousSelection = input.previous?.sections.get(sectionId)
    const nextSelection = input.next.sections.get(sectionId)
    if (
      nextSelection
      && (
        previousSelection !== nextSelection
        || input.previous?.meta.get(sectionId) !== input.next.meta.get(sectionId)
      )
    ) {
      changed.add(sectionId)
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

const deriveMembershipState = (input: {
  action: DeriveAction
  view: View
  query: QueryState
  queryDelta: QueryDelta
  previous?: MembershipState
  impact: BaseImpact
  index: IndexState
  indexDelta?: IndexDelta
}): {
  state: MembershipState
  delta: MembershipDelta
} => {
  if (input.action === 'reuse' && input.previous) {
    return {
      state: input.previous,
      delta: EMPTY_MEMBERSHIP_PHASE_DELTA
    }
  }

  const synced = syncMembershipState({
    previous: input.previous,
    view: input.view,
    query: input.query,
    queryDelta: input.queryDelta,
    index: input.index,
    impact: input.impact,
    indexDelta: input.indexDelta,
    action: input.action
  })
  const delta = buildMembershipDelta({
    previous: input.previous,
    next: synced.state,
    records: synced.records,
    action: input.action
  })

  return {
    state: synced.state,
    delta
  }
}

export const runMembershipStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  view: View
  query: QueryState
  queryDelta: QueryDelta
  previous?: MembershipState
  index: IndexState
  indexDelta?: IndexDelta
}): {
  action: DeriveAction
  state: MembershipState
  delta: MembershipDelta
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
  const action = resolveMembershipAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    previous: input.previous,
    queryDelta: input.queryDelta,
    indexDelta: input.indexDelta
  })
  const deriveStart = now()
  const derived = deriveMembershipState({
    action,
    view: input.view,
    query: input.query,
    queryDelta: input.queryDelta,
    previous: input.previous,
    impact: input.impact,
    index: input.index,
    indexDelta: input.indexDelta
  })
  const deriveMs = now() - deriveStart
  const outputCount = derived.state.sections.order.length
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
      inputCount: input.previous?.sections.order.length,
      outputCount,
      reusedNodeCount,
      rebuiltNodeCount: outputCount - reusedNodeCount,
      changedSectionCount
    }
  }
}
