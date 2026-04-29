import type { DataDoc } from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/op'
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
  DocumentOperation,
  MutationFootprint,
  void
>

export type EngineCommit = MutationCommitRecord<
  DataDoc,
  DocumentOperation,
  MutationFootprint
>

export type EngineCommits = CommitStream<EngineCommit>
