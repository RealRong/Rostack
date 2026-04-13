import type { BaseOperation } from '@dataview/core/contracts/operations'
import type {
  CommitResult,
  HistoryState
} from '../contracts/public'
import type {
  EngineState,
  Store
} from './store'

const trimUndo = (
  entries: EngineState['history']['undo'],
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
  history: EngineState['history']
): EngineState['history'] => ({
  ...history,
  undo: [],
  redo: []
})

export const clearRedo = (
  history: EngineState['history']
): EngineState['history'] => (
  history.redo.length
    ? {
        ...history,
        redo: []
      }
    : history
)

export const pushUndo = (
  history: EngineState['history'],
  entry: EngineState['history']['undo'][number]
): EngineState['history'] => ({
  ...history,
  undo: trimUndo([...history.undo, entry], history.cap)
})

export const takeUndo = (history: EngineState['history']): {
  history: EngineState['history']
  operations?: BaseOperation[]
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

export const takeRedo = (history: EngineState['history']): {
  history: EngineState['history']
  operations?: BaseOperation[]
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
      undo: trimUndo([...history.undo, entry], history.cap),
      redo: history.redo.slice(0, -1)
    },
    operations: entry.redo
  }
}

export const historyState = (
  history: EngineState['history']
): HistoryState => ({
  capacity: history.cap,
  undoDepth: history.undo.length,
  redoDepth: history.redo.length
})

export const canUndo = (
  history: EngineState['history']
) => history.undo.length > 0

export const canRedo = (
  history: EngineState['history']
) => history.redo.length > 0

export const createWriteHistory = (input: {
  store: Store
  replay: (
    kind: 'undo' | 'redo',
    operations: readonly BaseOperation[],
    history: EngineState['history']
  ) => CommitResult
}) => ({
  state: () => historyState(input.store.get().history),
  canUndo: () => canUndo(input.store.get().history),
  canRedo: () => canRedo(input.store.get().history),
  undo: (): CommitResult => {
    const replay = takeUndo(input.store.get().history)
    return replay.operations
      ? input.replay('undo', replay.operations, replay.history)
      : {
          issues: [],
          applied: false
        }
  },
  redo: (): CommitResult => {
    const replay = takeRedo(input.store.get().history)
    return replay.operations
      ? input.replay('redo', replay.operations, replay.history)
      : {
          issues: [],
          applied: false
        }
  },
  clear: () => {
    const current = input.store.get()
    if (!current.history.undo.length && !current.history.redo.length) {
      return
    }

    input.store.set({
      ...current,
      history: clearHistory(current.history)
    })
  }
})
