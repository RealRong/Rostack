import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type {
  HistoryState
} from '@dataview/engine/contracts/history'
import type {
  CommitResult
} from '@dataview/engine/contracts/result'
import type {
  CoreRuntime
} from '@dataview/engine/core/runtime'
import type {
  EngineHistoryState
} from '@dataview/engine/runtime/state'

const trimUndo = (
  entries: EngineHistoryState['undo'],
  cap: number
) => {
  if (!cap) {
    return []
  }
  if (entries.length <= cap) {
    return entries
  }
  return entries.slice(entries.length - cap)
}

export const clearHistory = (
  history: EngineHistoryState
): EngineHistoryState => ({
  ...history,
  undo: [],
  redo: []
})

export const clearRedo = (
  history: EngineHistoryState
): EngineHistoryState => (
  history.redo.length
    ? {
        ...history,
        redo: []
      }
    : history
)

export const pushUndo = (
  history: EngineHistoryState,
  entry: EngineHistoryState['undo'][number]
): EngineHistoryState => ({
  ...history,
  undo: trimUndo([...history.undo, entry], history.capacity)
})

export const takeUndo = (history: EngineHistoryState): {
  history: EngineHistoryState
  operations?: DocumentOperation[]
} => {
  const entry = history.undo.at(-1)
  if (!entry) {
    return {
      history
    }
  }

  return {
    history: {
      ...history,
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, entry]
    },
    operations: entry.undo
  }
}

export const takeRedo = (history: EngineHistoryState): {
  history: EngineHistoryState
  operations?: DocumentOperation[]
} => {
  const entry = history.redo.at(-1)
  if (!entry) {
    return {
      history
    }
  }

  return {
    history: {
      ...history,
      undo: trimUndo([...history.undo, entry], history.capacity),
      redo: history.redo.slice(0, -1)
    },
    operations: entry.redo
  }
}

export const historyState = (
  history: EngineHistoryState
): HistoryState => ({
  capacity: history.capacity,
  undoDepth: history.undo.length,
  redoDepth: history.redo.length
})

export const canUndo = (
  history: EngineHistoryState
) => history.undo.length > 0

export const canRedo = (
  history: EngineHistoryState
) => history.redo.length > 0

export const createWriteHistory = (input: {
  runtime: CoreRuntime
  replay: (
    kind: 'undo' | 'redo',
    operations: readonly DocumentOperation[],
    history: EngineHistoryState
  ) => CommitResult
}) => ({
  state: () => historyState(input.runtime.state().history),
  canUndo: () => canUndo(input.runtime.state().history),
  canRedo: () => canRedo(input.runtime.state().history),
  undo: (): CommitResult => {
    const replay = takeUndo(input.runtime.state().history)
    return replay.operations
      ? input.replay('undo', replay.operations, replay.history)
      : {
          issues: [],
          applied: false
        }
  },
  redo: (): CommitResult => {
    const replay = takeRedo(input.runtime.state().history)
    return replay.operations
      ? input.replay('redo', replay.operations, replay.history)
      : {
          issues: [],
          applied: false
        }
  },
  clear: () => {
    const current = input.runtime.state()
    if (!current.history.undo.length && !current.history.redo.length) {
      return
    }

    input.runtime.updateState({
      ...current,
      history: clearHistory(current.history)
    })
  }
})
