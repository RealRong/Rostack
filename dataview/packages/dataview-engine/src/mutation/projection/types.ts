import type {
  DataDoc
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
import type {
  DataviewMutationKey,
  DataviewTrace
} from '@dataview/core/operations'
import type {
  ApplyCommit
} from '@shared/mutation'
import type {
  CommitTrace,
  IndexStageTrace,
  IndexTrace
} from '@dataview/engine/contracts/performance'
import type {
  PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import type {
  DataviewMutationCache,
  DataviewPublish
} from '../types'

export interface DataviewPublishProjectionCapture {
  publish: DataviewPublish
  cache: DataviewMutationCache
}

export interface DataviewPublishProjectionOptions {
  performance?: PerformanceRuntime
}

export interface DataviewPublishProjectionUpdateInput {
  prev: {
    doc: DataDoc
    cache: DataviewMutationCache
  }
  doc: DataDoc
  commit: ApplyCommit<
    DataDoc,
    DocumentOperation,
    DataviewMutationKey,
    {
      trace: DataviewTrace
    }
  >
}

export interface DataviewPublishProjectionRuntime {
  reset(doc: DataDoc): DataviewPublishProjectionCapture
  update(input: DataviewPublishProjectionUpdateInput): DataviewPublishProjectionCapture
}

export interface DataviewCommitTraceInput {
  performance?: PerformanceRuntime
  startedAt: number
  commit: DataviewPublishProjectionUpdateInput['commit']
  trace: DataviewTrace
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
