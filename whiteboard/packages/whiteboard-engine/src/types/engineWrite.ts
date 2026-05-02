import type {
  ApplyCommit,
  MutationFootprint,
  MutationCommitRecord,
  MutationReplaceCommit
} from '@shared/mutation'
import type {
  WhiteboardMutationDelta
} from '../mutation'
import type {
  Document,
} from '@whiteboard/core/types'

export type EngineApplyCommit = ApplyCommit<
  Document,
  MutationFootprint,
  void,
  WhiteboardMutationDelta
>

export type EngineCommit = MutationCommitRecord<
  Document,
  MutationFootprint,
  WhiteboardMutationDelta
>

export type EngineReplaceCommit = MutationReplaceCommit<
  Document,
  WhiteboardMutationDelta
>
