import type {
  MembershipPhaseScope
} from '../../contracts/projector'
import type {
  PhaseAction,
  QueryPhaseDelta
} from '../../state'

export const createMembershipPhaseScope = (input: {
  action: PhaseAction
  delta: QueryPhaseDelta
}): MembershipPhaseScope => ({
  query: {
    action: input.action,
    delta: input.delta
  }
})
