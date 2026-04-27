import { filter as filterApi } from '../filter'
import { planFilterCandidateLookup } from '../query/filterCandidate'

export const filter = {
  ...filterApi,
  plan: {
    candidateLookup: planFilterCandidateLookup
  }
} as const

export { planFilterCandidateLookup }
export type * from '../filter'
export type {
  FilterCandidateLookupPlan
} from '../query/filterCandidate'
