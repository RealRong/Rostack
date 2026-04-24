import type {
  PublishPhaseScope
} from '../../contracts/projector'
import type {
  MembershipPhaseState,
  SummaryPhaseDelta,
  SummaryPhaseState
} from '../../state'

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
