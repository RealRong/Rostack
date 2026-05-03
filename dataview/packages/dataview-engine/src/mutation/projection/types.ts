import type {
  CommitTrace,
  IndexStageTrace,
  IndexTrace
} from '@dataview/engine/contracts/performance'
import type {
  PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import type {
  DataDoc
} from '@dataview/core/types'
import type {
  EngineCommit
} from '@dataview/engine/contracts/write'
export interface DataviewCommitTraceInput {
  performance?: PerformanceRuntime
  startedAt: number
  commit: EngineCommit
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
