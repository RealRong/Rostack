import type {
  BaseOperation
} from '@dataview/core/contracts/operations'
import type {
  HistoryState
} from '../history'
import type {
  History,
  HistoryEntry
} from '../state'

const trimUndo = (
  entries: HistoryEntry[],
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
  history: History
): History => ({
  ...history,
  undo: [],
  redo: []
})

export const clearRedo = (
  history: History
): History => (
  history.redo.length
    ? {
        ...history,
        redo: []
      }
    : history
)

export const pushUndo = (
  history: History,
  entry: HistoryEntry
): History => ({
  ...history,
  undo: trimUndo([...history.undo, entry], history.cap)
})

export const takeUndo = (history: History): {
  history: History
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

export const takeRedo = (history: History): {
  history: History
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

export const canUndo = (
  history: History
) => history.undo.length > 0

export const canRedo = (
  history: History
) => history.redo.length > 0

export const historyState = (
  history: History
): HistoryState => ({
  capacity: history.cap,
  undoDepth: history.undo.length,
  redoDepth: history.redo.length
})
