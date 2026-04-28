import type { DataDoc } from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import type {
  DataviewTrace
} from '@dataview/core/operations'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream,
  MutationFootprint
} from '@shared/mutation'

export type EngineApplyCommit = ApplyCommit<
  DataDoc,
  DocumentOperation,
  MutationFootprint,
  {
    trace: DataviewTrace
  }
>

export type EngineCommit = CommitRecord<
  DataDoc,
  DocumentOperation,
  MutationFootprint,
  {
    trace: DataviewTrace
  }
>

export type EngineCommits = CommitStream<EngineCommit>
