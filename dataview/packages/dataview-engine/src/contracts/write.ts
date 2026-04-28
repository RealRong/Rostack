import type { DataDoc } from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import type {
  ApplyCommit,
  CommitStream,
  MutationCommitRecord,
  MutationFootprint
} from '@shared/mutation'

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
