import type {
  MutationFootprint,
  MutationCommit,
  MutationCommitRecord,
  MutationReplaceCommit
} from '@shared/mutation'
import type {
  WhiteboardMutationDelta
} from '../mutation'
import type {
  Document,
  Operation,
} from '@whiteboard/core/types'

export type EngineApplyCommit = MutationCommit<
  Document,
  Operation,
  MutationFootprint,
  string,
  WhiteboardMutationDelta
> & {
  extra: void
}

export type EngineCommit = MutationCommitRecord<
  Document,
  Operation,
  MutationFootprint,
  WhiteboardMutationDelta
>

export type EngineReplaceCommit = MutationReplaceCommit<
  Document,
  WhiteboardMutationDelta
>
