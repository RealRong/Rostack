import type {
  ApplyCommit,
  CommitRecord,
  MutationFootprint,
} from '@shared/mutation'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import type {
  WhiteboardOperationReduceExtra
} from '@whiteboard/core/operations'

export type EngineApplyCommit = ApplyCommit<
  Document,
  Operation,
  MutationFootprint,
  WhiteboardOperationReduceExtra
>

export type EngineCommit = CommitRecord<
  Document,
  Operation,
  MutationFootprint,
  WhiteboardOperationReduceExtra
>
