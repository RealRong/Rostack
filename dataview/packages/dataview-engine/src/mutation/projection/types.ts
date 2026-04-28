import type {
  CommitTrace,
  IndexStageTrace,
  IndexTrace
} from '@dataview/engine/contracts/performance'
import type {
  PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import type {
  MutationCommitRecord,
  MutationFootprint
} from '@shared/mutation'
import type {
  DataDoc
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
export interface DataviewCommitTraceInput {
  performance?: PerformanceRuntime
  startedAt: number
  commit: MutationCommitRecord<
    DataDoc,
    DocumentOperation,
    MutationFootprint
  >
  index: {
    trace?: IndexTrace
  }
  active: {
    trace: {
      view: CommitTrace['view']
      snapshot: CommitTrace['snapshot']
      snapshotMs: number
    }
  }
  outputMs: number
}

export type {
  CommitTrace,
  IndexStageTrace,
  IndexTrace
}
