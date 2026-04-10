import type { HistoryState } from '@dataview/engine/history'
import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  createResetDelta
} from '@dataview/core/commit/delta'
import type { ResolvedWriteBatch } from '@dataview/engine/command'
import type {
  CommitResult,
  CommandResult,
  CommitTrace
} from '../../types'
import type { ReadRuntime } from '../read/read'
import type { HistoryReplay } from './history'
import { historyStacks } from './history'
import type { ProjectRuntime } from '../../project/source'
import {
  now
} from '../../perf/shared'
import {
  applyHistoryReplay,
  applyWriteBatch,
  createEmptyCommitResult,
  createRejectedCommandResult,
  createdFromChanges
} from './apply'
import {
  finalizeCommitResult
} from './sync'
import {
  createTraceDeltaSummary,
  type CommitTraceKind
} from './trace'

interface CommitDocumentStore {
  peekDocument: () => DataDoc
  installDocument: (document: DataDoc) => DataDoc
}

export interface CommitRuntimeOptions {
  document: CommitDocumentStore
  read: Pick<ReadRuntime, 'clear' | 'syncDocument'>
  project: Pick<ProjectRuntime, 'clear' | 'syncDocument'>
  historyCapacity: number
  perf?: {
    enabled: boolean
    recordCommit: (trace: Omit<CommitTrace, 'id'>) => void
  }
}

export interface CommitRuntime {
  history: {
    state: () => HistoryState
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
    undo: () => CommitResult
    redo: () => CommitResult
  }
  dispatch: (writeBatch: ResolvedWriteBatch) => CommandResult
  replace: (document: DataDoc) => void
}

const finalize = <TResult extends CommitResult>(input: {
  result: TResult
  shouldSyncDocument: boolean
  store: CommitDocumentStore
  read: Pick<ReadRuntime, 'syncDocument'>
  project: Pick<ProjectRuntime, 'syncDocument'>
  perf?: CommitRuntimeOptions['perf']
  trace?: {
    kind: CommitTraceKind
    delta: TResult['changes']
    startedAt: number
    commitMs?: number
  }
}): TResult => finalizeCommitResult({
  result: input.result,
  shouldSyncDocument: input.shouldSyncDocument,
  store: input.store,
  read: input.read,
  project: input.project,
  perf: input.perf,
  ...(input.trace?.delta
    ? {
        trace: {
          kind: input.trace.kind,
          delta: input.trace.delta,
          deltaSummary: createTraceDeltaSummary(input.trace.delta),
          startedAt: input.trace.startedAt,
          commitMs: input.trace.commitMs
        }
      }
    : {})
})

export const commitRuntime = (options: CommitRuntimeOptions): CommitRuntime => {
  const store = options.document
  const history = historyStacks({
    capacity: options.historyCapacity
  })

  const dispatch = (writeBatch: ResolvedWriteBatch): CommandResult => {
    if (!writeBatch.canApply) {
      return finalize({
        result: createRejectedCommandResult(writeBatch.issues),
        shouldSyncDocument: false,
        store,
        read: options.read,
        project: options.project,
        perf: options.perf
      })
    }

    if (!writeBatch.operations.length) {
      return finalize({
        result: createRejectedCommandResult(writeBatch.issues),
        shouldSyncDocument: false,
        store,
        read: options.read,
        project: options.project,
        perf: options.perf
      })
    }

    const startedAt = now()
    const beforeDocument = store.peekDocument()
    const commitStart = now()
    const applied = applyWriteBatch(beforeDocument, writeBatch)
    const { undo, redo, document: afterDocument, delta } = applied
    store.installDocument(afterDocument)

    history.clearRedo()
    if (options.historyCapacity > 0) {
      history.pushUndo({ undo, redo })
    }

    return finalize({
      result: {
        issues: writeBatch.issues,
        applied: true,
        changes: delta,
        created: createdFromChanges(delta)
      },
      shouldSyncDocument: true,
      store,
      read: options.read,
      project: options.project,
      perf: options.perf,
      trace: {
        kind: 'dispatch',
        delta,
        startedAt,
        commitMs: now() - commitStart
      }
    })
  }

  const replay = (
    replayEntry?: HistoryReplay,
    kind: 'undo' | 'redo' = 'undo'
  ): CommitResult => {
    if (!replayEntry) {
      return finalize({
        result: createEmptyCommitResult(),
        shouldSyncDocument: false,
        store,
        read: options.read,
        project: options.project,
        perf: options.perf
      })
    }

    const startedAt = now()
    const beforeDocument = store.peekDocument()
    const commitStart = now()
    const { document: afterDocument, delta } = applyHistoryReplay(beforeDocument, replayEntry)
    store.installDocument(afterDocument)

    return finalize({
      result: {
        issues: [],
        applied: true,
        changes: delta
      },
      shouldSyncDocument: true,
      store,
      read: options.read,
      project: options.project,
      perf: options.perf,
      trace: {
        kind,
        delta,
        startedAt,
        commitMs: now() - commitStart
      }
    })
  }

  return {
    history: {
      state: () => history.getState(),
      canUndo: () => history.canUndo(),
      canRedo: () => history.canRedo(),
      clear: () => {
        history.clear()
      },
      undo: () => replay(history.undo(), 'undo'),
      redo: () => replay(history.redo(), 'redo')
    },
    dispatch,
    replace: document => {
      const startedAt = now()
      const beforeDocument = store.peekDocument()
      const nextDocument = document
      const delta = createResetDelta(beforeDocument, nextDocument)

      history.clear()
      options.read.clear()
      options.project.clear()
      store.installDocument(nextDocument)
      options.read.syncDocument(nextDocument, delta)
      const projectResult = options.project.syncDocument(nextDocument, delta)
      if (options.perf?.enabled && projectResult.trace) {
        options.perf.recordCommit({
          kind: 'replace',
          timings: {
            totalMs: now() - startedAt,
            commitMs: 0,
            indexMs: projectResult.trace.timings.indexMs,
            projectMs: projectResult.trace.timings.projectMs,
            publishMs: projectResult.trace.timings.publishMs
          },
          delta: createTraceDeltaSummary(delta),
          index: projectResult.trace.index,
          project: projectResult.trace.project,
          publish: projectResult.trace.publish
        })
      }
    }
  }
}
