import type { DataDoc } from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import type {
  DataviewMutationKey,
  DataviewTrace
} from '@dataview/core/operations'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream
} from '@shared/mutation'

export type EngineApplyCommit = ApplyCommit<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  }
>

export type EngineCommit = CommitRecord<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  }
>

export type EngineCommits = CommitStream<EngineCommit>
