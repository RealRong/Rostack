import type {
  MembershipPhaseScope,
  PublishPhaseScope,
  SummaryPhaseScope
} from '../contracts/projector'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction,
  QueryPhaseDelta,
  SummaryPhaseDelta,
  SummaryPhaseState
} from '../state'

export const createMembershipPhaseScope = (input: {
  action: PhaseAction
  delta: QueryPhaseDelta
}): MembershipPhaseScope => ({
  query: {
    action: input.action,
    delta: input.delta
  }
})

export const createSummaryPhaseScope = (input: {
  action: PhaseAction
  previous?: MembershipPhaseState
  delta: MembershipPhaseDelta
}): SummaryPhaseScope => ({
  membership: {
    action: input.action,
    previous: input.previous,
    delta: input.delta
  }
})

export const createPublishPhaseScope = (
  input?: {
    reset?: boolean
    membership?: {
      previous?: MembershipPhaseState
    }
    summary?: {
      previous?: SummaryPhaseState
      delta: SummaryPhaseDelta
    }
  }
): PublishPhaseScope => ({
  reset: input?.reset === true,
  ...(input?.membership
    ? {
        membership: input.membership
      }
    : {}),
  ...(input?.summary
    ? {
        summary: input.summary
      }
    : {})
})

export const mergePublishPhaseScope = (
  current: PublishPhaseScope | undefined,
  next: PublishPhaseScope
): PublishPhaseScope => createPublishPhaseScope({
  reset: current?.reset === true || next.reset,
  membership: next.membership ?? current?.membership,
  summary: next.summary ?? current?.summary
})
