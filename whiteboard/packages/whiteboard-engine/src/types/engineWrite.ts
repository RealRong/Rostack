import type {
  MutationFootprint
} from '@shared/mutation'
import type {
  MutationCommit,
  MutationCommitRecord,
  MutationReplaceCommit
} from '@shared/mutation/write'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'

export type EngineApplyCommit = MutationCommit<
  Document,
  Operation,
  MutationFootprint
> & {
  extra: void
}

export type EngineCommit = MutationCommitRecord<
  Document,
  Operation,
  MutationFootprint
>

export type EngineReplaceCommit = MutationReplaceCommit<Document>
