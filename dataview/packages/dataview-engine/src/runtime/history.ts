import type { BaseOperation } from '@dataview/core/contracts/operations'
import type {
  CommitResult,
  HistoryState
} from '#dataview-engine/contracts/public'
import type {
  EngineRuntimeState,
  RuntimeStore
} from '#dataview-engine/runtime/store'

const trimUndo = (
  entries: EngineRuntimeState['history']['undo'],
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
  history: EngineRuntimeState['history']
): EngineRuntimeState['history'] => ({
  ...history,
  undo: [],
  redo: []
})

export const clearRedo = (
  history: EngineRuntimeState['history']
): EngineRuntimeState['history'] => (
  history.redo.length
    ? {
        ...history,
        redo: []
      }
    : history
)

export const pushUndo = (
  history: EngineRuntimeState['history'],
  entry: EngineRuntimeState['history']['undo'][number]
): EngineRuntimeState['history'] => ({
  ...history,
  undo: trimUndo([...history.undo, entry], history.cap)
})

export const takeUndo = (history: EngineRuntimeState['history']): {
  history: EngineRuntimeState['history']
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

export const takeRedo = (history: EngineRuntimeState['history']): {
  history: EngineRuntimeState['history']
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
  history: EngineRuntimeState['history']
): HistoryState => ({
  capacity: history.cap,
  undoDepth: history.undo.length,
  redoDepth: history.redo.length
})

export const canUndo = (
  history: EngineRuntimeState['history']
) => history.undo.length > 0

export const canRedo = (
  history: EngineRuntimeState['history']
) => history.redo.length > 0

export const createWriteHistory = (input: {
  store: RuntimeStore
  replay: (
    kind: 'undo' | 'redo',
    operations: readonly BaseOperation[],
    history: EngineRuntimeState['history']
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
