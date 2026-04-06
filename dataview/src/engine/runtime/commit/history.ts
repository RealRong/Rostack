import type { BaseOperation } from '@dataview/core/contracts/operations'
import type { CommitHistoryDepth, HistoryState } from '@dataview/engine/history'

export interface HistoryEntry {
  undo: BaseOperation[]
  redo: BaseOperation[]
}

export interface HistoryReplay {
  kind: 'undo' | 'redo'
  operations: BaseOperation[]
}

export interface HistoryStacksOptions {
  capacity: number
}

export interface HistoryStacks {
  clear: () => void
  getState: () => HistoryState
  pushUndo: (entry: HistoryEntry) => void
  clearRedo: () => void
  undo: () => HistoryReplay | undefined
  redo: () => HistoryReplay | undefined
  canUndo: () => boolean
  canRedo: () => boolean
  depth: () => CommitHistoryDepth
}

export interface HistoryEntry {
  undo: BaseOperation[]
  redo: BaseOperation[]
}

const trimUndoStack = (entries: HistoryEntry[], capacity: number) => {
  if (!capacity) {
    return []
  }
  if (entries.length <= capacity) {
    return entries
  }
  return entries.slice(entries.length - capacity)
}

export const historyStacks = (options: HistoryStacksOptions): HistoryStacks => {
  let undoStack: HistoryEntry[] = []
  let redoStack: HistoryEntry[] = []

  return {
    clear() {
      undoStack = []
      redoStack = []
    },
    getState: (): HistoryState => ({
      capacity: options.capacity,
      undoDepth: undoStack.length,
      redoDepth: redoStack.length
    }),
    pushUndo(entry: HistoryEntry) {
      undoStack = trimUndoStack([...undoStack, entry], options.capacity)
    },
    clearRedo() {
      redoStack = []
    },
    undo: () => {
      const entry = undoStack.pop()
      if (!entry) {
        return undefined
      }
      redoStack = [...redoStack, entry]
      return {
        kind: 'undo',
        operations: entry.undo
      }
    },
    redo: () => {
      const entry = redoStack.pop()
      if (!entry) {
        return undefined
      }
      undoStack = trimUndoStack([...undoStack, entry], options.capacity)
      return {
        kind: 'redo',
        operations: entry.redo
      }
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    depth: () => ({
      undoDepth: undoStack.length,
      redoDepth: redoStack.length
    })
  }
}
