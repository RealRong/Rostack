import type {
  DataviewActiveSpec,
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewIndexResult
} from '@dataview/engine/active/index/runtime'
import type {
  DataviewActivePlan
} from '@dataview/engine/active/plan'
import {
  syncMembershipState
} from '@dataview/engine/active/membership/derive'
import type {
  DataviewActiveState,
  DataviewStageTrace,
  MembershipPhaseDelta,
  MembershipPhaseState,
  QueryPhaseDelta,
  QueryPhaseState
} from '@dataview/engine/active/state'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA
} from '@dataview/engine/active/state'
import type {
  SectionId
} from '@dataview/engine/contracts/shared'
import { now } from '@dataview/engine/runtime/clock'
import {
  createActiveStageMetrics
} from '@dataview/engine/active/projection/metrics'

const buildMembershipDelta = (input: {
  previous: MembershipPhaseState
  next: MembershipPhaseState
  records: MembershipPhaseDelta['records']
  action: DataviewActivePlan['membership']['action']
}): MembershipPhaseDelta => {
  const nextKeys = input.next.sections.order.filter(sectionId => input.next.sections.get(sectionId))
  const previousKeys = input.previous.sections.order
  const removed = previousKeys.filter(sectionId => !input.next.sections.get(sectionId))
  const rebuild = input.action === 'rebuild'
  const orderChanged = previousKeys.length !== input.next.sections.order.length
    || previousKeys.some((sectionId, index) => sectionId !== input.next.sections.order[index])

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
    const previousSelection = input.previous.sections.get(sectionId)
    const nextSelection = input.next.sections.get(sectionId)
    if (
      nextSelection
      && (
        previousSelection !== nextSelection
        || input.previous.meta.get(sectionId) !== input.next.meta.get(sectionId)
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

export const runMembershipStep = (input: {
  frame: DataviewFrame
  active: DataviewActiveSpec
  query: QueryPhaseState
  queryDelta: QueryPhaseDelta
  index: DataviewIndexResult
  plan: DataviewActivePlan
  previous: DataviewActiveState
}): {
  state: MembershipPhaseState
  delta: MembershipPhaseDelta
  trace: DataviewStageTrace
} => {
  const action = input.plan.membership.action
  if (action === 'reuse') {
    return {
      state: input.previous.membership,
      delta: EMPTY_MEMBERSHIP_PHASE_DELTA,
      trace: {
        action,
        changed: false,
        deriveMs: 0,
        publishMs: 0,
        metrics: createActiveStageMetrics({
          inputCount: input.previous.membership.sections.order.length,
          outputCount: input.previous.membership.sections.order.length,
          reusedNodeCount: input.previous.membership.sections.order.length,
          rebuiltNodeCount: 0,
          changedSectionCount: 0
        })
      }
    }
  }

  const deriveStart = now()
  const synced = syncMembershipState({
    previous: input.previous.membership,
    view: input.active.view,
    change: input.frame.change,
    query: input.query,
    queryDelta: input.queryDelta,
    index: input.index.index.state,
    indexDelta: input.index.index.delta,
    action
  })
  const delta = buildMembershipDelta({
    previous: input.previous.membership,
    next: synced.state,
    records: synced.records,
    action
  })
  const deriveMs = now() - deriveStart
  const outputCount = synced.state.sections.order.length
  const changedSectionCount = delta.rebuild
    ? outputCount
    : Math.min(outputCount, delta.changed.length + delta.removed.length)

  return {
    state: synced.state,
    delta,
    trace: {
      action,
      changed: delta.rebuild
        || delta.orderChanged
        || delta.removed.length > 0
        || delta.changed.length > 0
        || delta.records.size > 0,
      deriveMs,
      publishMs: 0,
      metrics: createActiveStageMetrics({
        inputCount: input.previous.membership.sections.order.length,
        outputCount,
        changedNodeCount: changedSectionCount,
        changedSectionCount
      })
    }
  }
}
