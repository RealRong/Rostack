import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type {
  DataviewMutationKey,
  DataviewTrace
} from '@dataview/core/mutation'
import type {
  CommitRecord,
  CommitStream,
  Write
} from '@shared/mutation'

export type EngineWrite = Write<
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
