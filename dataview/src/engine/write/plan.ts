import {
  createResetDelta
} from '@dataview/core/commit/delta'
import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  ResolvedWriteBatch
} from '../command'
import {
  now
} from '../perf/shared'
import type {
  State
} from '../state'
import type {
  CommandResult,
  CommitResult
} from '../types'
import {
  applyHistoryReplay,
  applyWriteBatch,
  createEmptyCommitResult,
  createRejectedCommandResult,
  createdFromChanges
} from '../runtime/commit/apply'
import {
  clearHistory,
  clearRedo,
  pushUndo,
  takeRedo,
  takeUndo
} from './history'

export type Kind =
  | 'write'
  | 'undo'
  | 'redo'
  | 'load'

export type Draft<TResult extends CommitResult = CommitResult> =
  | {
      ok: false
      result: TResult
    }
  | {
      ok: true
      kind: Kind
      doc: DataDoc
      history: State['history']
      delta: NonNullable<CommitResult['changes']>
      result: TResult
      ms?: number
    }

export type Plan<TResult extends CommitResult = CommitResult> = (
  base: State
) => Draft<TResult>

export interface PlanApi {
  write: (batch: ResolvedWriteBatch) => Plan<CommandResult>
  undo: () => Plan<CommitResult>
  redo: () => Plan<CommitResult>
  load: (doc: DataDoc) => Plan<CommitResult>
}

export const createPlanApi = (): PlanApi => ({
  write: batch => base => {
    if (!batch.canApply || !batch.operations.length) {
      return {
        ok: false,
        result: createRejectedCommandResult(batch.issues)
      }
    }

    const startedAt = now()
    const applied = applyWriteBatch(base.doc, batch)
    const history = clearRedo(base.history)
    const nextHistory = base.history.cap > 0
      ? pushUndo(history, {
          undo: applied.undo,
          redo: applied.redo
        })
      : history

    return {
      ok: true,
      kind: 'write',
      doc: applied.document,
      history: nextHistory,
      delta: applied.delta,
      result: {
        issues: batch.issues,
        applied: true,
        changes: applied.delta,
        created: createdFromChanges(applied.delta)
      },
      ms: now() - startedAt
    }
  },
  undo: () => base => {
    const replay = takeUndo(base.history)
    if (!replay.operations) {
      return {
        ok: false,
        result: createEmptyCommitResult()
      }
    }

    const startedAt = now()
    const applied = applyHistoryReplay(base.doc, {
      kind: 'undo',
      operations: replay.operations
    })

    return {
      ok: true,
      kind: 'undo',
      doc: applied.document,
      history: replay.history,
      delta: applied.delta,
      result: {
        issues: [],
        applied: true,
        changes: applied.delta
      },
      ms: now() - startedAt
    }
  },
  redo: () => base => {
    const replay = takeRedo(base.history)
    if (!replay.operations) {
      return {
        ok: false,
        result: createEmptyCommitResult()
      }
    }

    const startedAt = now()
    const applied = applyHistoryReplay(base.doc, {
      kind: 'redo',
      operations: replay.operations
    })

    return {
      ok: true,
      kind: 'redo',
      doc: applied.document,
      history: replay.history,
      delta: applied.delta,
      result: {
        issues: [],
        applied: true,
        changes: applied.delta
      },
      ms: now() - startedAt
    }
  },
  load: doc => base => {
    const delta = createResetDelta(base.doc, doc)

    return {
      ok: true,
      kind: 'load',
      doc,
      history: clearHistory(base.history),
      delta,
      result: {
        issues: [],
        applied: true,
        changes: delta
      },
      ms: 0
    }
  }
})
