import { now } from '@dataview/engine/runtime/clock'
import {
  summarizeDelta,
  toPerformanceKind
} from '@dataview/engine/runtime/performance'
import type {
  CommitTrace,
  DataviewCommitTraceInput,
  IndexStageTrace,
  IndexTrace
} from './types'

const createEmptyIndexStageTrace = (): IndexStageTrace => ({
  action: 'reuse',
  changed: false,
  durationMs: 0
})

export const createEmptyIndexTrace = (): IndexTrace => ({
  changed: false,
  timings: {
    totalMs: 0
  },
  records: createEmptyIndexStageTrace(),
  search: createEmptyIndexStageTrace(),
  bucket: createEmptyIndexStageTrace(),
  sort: createEmptyIndexStageTrace(),
  summaries: createEmptyIndexStageTrace()
})

export const createDataviewCommitTrace = (
  input: DataviewCommitTraceInput
): Omit<CommitTrace, 'id'> | undefined => {
  if (!input.performance?.enabled) {
    return undefined
  }

  return {
    kind: toPerformanceKind(input.commit),
    timings: {
      totalMs: now() - input.startedAt,
      indexMs: input.index.trace?.timings.totalMs,
      viewMs: input.active.trace.view.timings.totalMs,
      outputMs: input.outputMs,
      snapshotMs: input.active.trace.snapshotMs
    },
    delta: summarizeDelta(input.commit),
    index: input.index.trace ?? createEmptyIndexTrace(),
    view: input.active.trace.view,
    snapshot: input.active.trace.snapshot
  }
}
