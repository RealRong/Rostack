import type {
  MutationFootprint,
  MutationCommit,
  MutationCommitRecord,
  MutationReplaceCommit
} from '@shared/mutation'
import type {
  WhiteboardInternalOperation
} from '@whiteboard/core/operations'
import type {
  Document
} from '@whiteboard/core/types'

export type EngineApplyCommit = MutationCommit<
  Document,
  WhiteboardInternalOperation,
  MutationFootprint
> & {
  extra: void
}

export type EngineCommit = MutationCommitRecord<
  Document,
  WhiteboardInternalOperation,
  MutationFootprint
>

export type EngineReplaceCommit = MutationReplaceCommit<Document>
