import type {
  CommitDelta,
  DataDoc
} from '@dataview/core/contracts'
import type {
  CommitResult,
  CommitTrace,
  TraceDeltaSummary
} from '../../types'
import type { ReadRuntime } from '../read/read'
import type { ProjectRuntime } from '../../project/source'
import {
  now
} from '../../perf/shared'

interface CommitDocumentStore {
  peekDocument: () => DataDoc
}

export const finalizeCommitResult = <TResult extends CommitResult>(input: {
  result: TResult
  shouldSyncDocument: boolean
  store: CommitDocumentStore
  read: Pick<ReadRuntime, 'syncDocument'>
  project: Pick<ProjectRuntime, 'syncDocument'>
  perf?: {
    enabled: boolean
    recordCommit: (trace: Omit<CommitTrace, 'id'>) => void
  }
  trace?: {
    kind: Omit<CommitTrace, 'id' | 'timings' | 'delta' | 'index' | 'project' | 'publish'>['kind']
    delta: CommitDelta
    deltaSummary: TraceDeltaSummary
    startedAt: number
    commitMs?: number
  }
}): TResult => {
  const { result } = input
  if (!input.shouldSyncDocument) {
    return result
  }

  input.read.syncDocument(input.store.peekDocument(), result.changes)
  const projectResult = input.project.syncDocument(input.store.peekDocument(), result.changes)
  if (
    input.perf?.enabled
    && input.trace
    && projectResult.trace
  ) {
    input.perf.recordCommit({
      kind: input.trace.kind,
      timings: {
        totalMs: now() - input.trace.startedAt,
        commitMs: input.trace.commitMs,
        indexMs: projectResult.trace.timings.indexMs,
        projectMs: projectResult.trace.timings.projectMs,
        publishMs: projectResult.trace.timings.publishMs
      },
      delta: input.trace.deltaSummary,
      index: projectResult.trace.index,
      project: projectResult.trace.project,
      publish: projectResult.trace.publish
    })
  }

  return result
}
