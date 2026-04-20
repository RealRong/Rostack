import type {
  CommandResult
} from '@whiteboard/engine/types/result'
import type { Commit } from '@whiteboard/engine/types/commit'
import type { WriteRecord } from '@whiteboard/engine/types/writeRecord'
import type { Draft } from '@whiteboard/engine/types/write'
import { success } from '@whiteboard/engine/result'
import type { CommitHistoryEffect } from '@whiteboard/engine/write/types'

const readCommitAt = (): number => Date.now()

export const applyCommitHistoryEffect = <T>(
  draft: Extract<Draft<T>, { ok: true }>,
  effect: CommitHistoryEffect,
  history: {
    clear: () => void
    capture: (input: {
      ops: readonly import('@whiteboard/core/types').Operation[]
      inverse: readonly import('@whiteboard/core/types').Operation[]
      origin: import('@whiteboard/core/types').Origin
    }) => void
  }
) => {
  if (effect === 'reset') {
    history.clear()
    return
  }
  if (effect !== 'record' || draft.inverse.length === 0) {
    return
  }

  history.capture({
    ops: draft.ops,
    inverse: draft.inverse,
    origin: draft.origin
  })
}

export const createCommit = <T>(
  draft: Extract<Draft<T>, { ok: true }>,
  rev: number
): CommandResult<T> => {
  const commit: Commit = {
    rev,
    at: readCommitAt(),
    origin: draft.origin,
    doc: draft.doc,
    ops: draft.ops,
    changes: draft.changes
  }

  return success(commit, draft.value)
}

export const createWriteRecord = <T>(
  draft: Extract<Draft<T>, { ok: true }>,
  rev: number
): WriteRecord => ({
  rev,
  origin: draft.origin,
  forward: draft.ops,
  inverse: draft.inverse,
  history: draft.history
})
