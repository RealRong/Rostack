import type { DataDoc } from '@dataview/core/types'
import type {
  MutationFootprint
} from '@shared/mutation'
import type {
  ApplyCommit,
  CommitStream,
  MutationCommitRecord
} from '@shared/mutation/write'

export type EngineApplyCommit = ApplyCommit<
  DataDoc,
  MutationFootprint
>

export type EngineCommit = MutationCommitRecord<
  DataDoc,
  MutationFootprint
>

export type EngineCommits = CommitStream<EngineCommit>
