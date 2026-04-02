import type { GroupBaseOperation } from '@/core/contracts/operations'
import type { GroupCommitHistoryDepth, GroupHistoryState } from '@/engine/history'

export interface GroupHistoryEntry {
  undo: GroupBaseOperation[]
  redo: GroupBaseOperation[]
}

export interface GroupHistoryReplay {
  kind: 'undo' | 'redo'
  operations: GroupBaseOperation[]
}

export interface HistoryStacksOptions {
  capacity: number
}

export interface GroupHistoryStacks {
  clear: () => void
  getState: () => GroupHistoryState
  pushUndo: (entry: GroupHistoryEntry) => void
  clearRedo: () => void
  undo: () => GroupHistoryReplay | undefined
  redo: () => GroupHistoryReplay | undefined
  canUndo: () => boolean
  canRedo: () => boolean
  depth: () => GroupCommitHistoryDepth
}

const trimUndoStack = (entries: GroupHistoryEntry[], capacity: number) => {
  if (!capacity) {
    return []
  }
  if (entries.length <= capacity) {
    return entries
  }
  return entries.slice(entries.length - capacity)
}

export const historyStacks = (options: HistoryStacksOptions): GroupHistoryStacks => {
  let undoStack: GroupHistoryEntry[] = []
  let redoStack: GroupHistoryEntry[] = []

  return {
    clear() {
      undoStack = []
      redoStack = []
    },
    getState: (): GroupHistoryState => ({
      capacity: options.capacity,
      undoDepth: undoStack.length,
      redoDepth: redoStack.length
    }),
    pushUndo(entry: GroupHistoryEntry) {
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
