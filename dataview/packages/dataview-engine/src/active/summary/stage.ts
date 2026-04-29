import type {
  DataviewActiveSpec
} from '@dataview/engine/active/frame'
import type {
  DataviewIndexResult
} from '@dataview/engine/active/index/runtime'
import type {
  DataviewActivePlan
} from '@dataview/engine/active/plan'
import {
  deriveSummaryState,
  resolveSummaryTouchedSections
} from '@dataview/engine/active/summary/derive'
import type {
  DataviewActiveState,
  DataviewStageTrace,
  MembershipPhaseDelta,
  MembershipPhaseState,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import {
  EMPTY_SUMMARY_PHASE_DELTA
} from '@dataview/engine/active/state'
import { now } from '@dataview/engine/runtime/clock'
import {
  createActiveStageMetrics
} from '@dataview/engine/active/projection/metrics'

export const runSummaryStep = (input: {
  active: DataviewActiveSpec
  membership: MembershipPhaseState
  membershipDelta: MembershipPhaseDelta
  index: DataviewIndexResult
  plan: DataviewActivePlan
  previous: DataviewActiveState
}): {
  state: SummaryPhaseState
  delta: import('@dataview/engine/active/state').SummaryPhaseDelta
  trace: DataviewStageTrace
} => {
  const action = input.plan.summary.action
  if (action === 'reuse') {
    return {
      state: input.previous.summary,
      delta: EMPTY_SUMMARY_PHASE_DELTA,
      trace: {
        action,
        changed: false,
        deriveMs: 0,
        publishMs: 0,
        metrics: createActiveStageMetrics({
          inputCount: input.previous.summary.bySection.size,
          outputCount: input.previous.summary.bySection.size,
          reusedNodeCount: input.previous.summary.bySection.size,
          rebuiltNodeCount: 0,
          changedSectionCount: 0
        })
      }
    }
  }

  const touchedSections = resolveSummaryTouchedSections({
    previousMembership: input.previous.membership,
    membership: input.membership,
    membershipDelta: input.membershipDelta,
    calcFields: input.active.calcFields,
    calculationDelta: input.index.index.delta?.calculation
  })
  const deriveStart = now()
  const derived = deriveSummaryState({
    previous: input.previous.summary,
    previousMembership: input.previous.membership,
    membership: input.membership,
    membershipDelta: input.membershipDelta,
    calcFields: input.active.calcFields,
    index: input.index.index.state,
    calculationDelta: input.index.index.delta?.calculation,
    touchedSections,
    action
  })
  const deriveMs = now() - deriveStart
  const outputCount = derived.state.bySection.size
  const changedSectionCount = derived.delta.rebuild
    ? outputCount
    : Math.min(outputCount, derived.delta.changed.length + derived.delta.removed.length)

  return {
    state: derived.state,
    delta: derived.delta,
    trace: {
      action,
      changed: derived.delta.rebuild
        || derived.delta.changed.length > 0
        || derived.delta.removed.length > 0,
      deriveMs,
      publishMs: 0,
      metrics: createActiveStageMetrics({
        inputCount: input.previous.summary.bySection.size,
        outputCount,
        changedNodeCount: changedSectionCount,
        changedSectionCount
      })
    }
  }
}
