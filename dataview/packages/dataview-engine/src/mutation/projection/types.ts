import type {
  CommitTrace,
  IndexStageTrace,
  IndexTrace
} from '@dataview/engine/contracts/performance'
import type {
  PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import type {
  MutationFootprint
} from '@shared/mutation'
import type {
  MutationCommitRecord
} from '@shared/mutation/write'
import type {
  DataDoc
} from '@dataview/core/types'
export interface DataviewCommitTraceInput {
  performance?: PerformanceRuntime
  startedAt: number
  commit: MutationCommitRecord<
    DataDoc,
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
