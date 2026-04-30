import type {
  MutationStructuralCanonicalOperation
} from '@shared/mutation'
import type {
  Operation
} from '@whiteboard/core/types'

export type WhiteboardInternalOperation =
  | Operation
  | MutationStructuralCanonicalOperation
