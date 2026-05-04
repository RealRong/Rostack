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
  MembershipPhaseDelta,
  MembershipPhaseState,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import {
  EMPTY_SUMMARY_PHASE_DELTA
} from '@dataview/engine/active/state'

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
} => {
  const action = input.plan.summary.action
  if (action === 'reuse') {
    return {
      state: input.previous.summary,
      delta: EMPTY_SUMMARY_PHASE_DELTA
    }
  }

  const touchedSections = resolveSummaryTouchedSections({
    previousMembership: input.previous.membership,
    membership: input.membership,
    membershipDelta: input.membershipDelta,
    calcFields: input.active.calcFields,
    calculationDelta: input.index.index.delta?.calculation
  })
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

  return {
    state: derived.state,
    delta: derived.delta
  }
}
