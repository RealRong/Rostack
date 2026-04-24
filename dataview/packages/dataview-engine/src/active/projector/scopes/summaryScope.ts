import type {
  SummaryPhaseScope
} from '../../contracts/projector'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction
} from '../../state'

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
