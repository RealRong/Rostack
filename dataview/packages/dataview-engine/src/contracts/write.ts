import type { CommitImpact, DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { Write, WriteStream } from '@shared/mutation'

export type EngineWrite = Write<
  DataDoc,
  DocumentOperation,
  never,
  {
    impact: CommitImpact
  }
>

export type EngineWrites = WriteStream<EngineWrite>
