import type {
  MutationWrite
} from '../writer/writes'

export type MutationOrigin =
  | 'user'
  | 'remote'
  | 'system'
  | 'history'

export type MutationHistoryEntry = {
  readonly writes: readonly MutationWrite[]
  readonly inverse: readonly MutationWrite[]
}

export type MutationHistoryState = {
  readonly undoDepth: number
  readonly redoDepth: number
}

export const createMutationHistory = () => {
  const undoStack: MutationHistoryEntry[] = []
  const redoStack: MutationHistoryEntry[] = []

  return {
    push(entry: MutationHistoryEntry) {
      undoStack.push(entry)
      redoStack.length = 0
    },
    popUndo() {
      const entry = undoStack.pop()
      if (!entry) {
        return undefined
      }
      redoStack.push(entry)
      return entry
    },
    popRedo() {
      const entry = redoStack.pop()
      if (!entry) {
        return undefined
      }
      undoStack.push(entry)
      return entry
    },
    clear() {
      undoStack.length = 0
      redoStack.length = 0
    },
    state(): MutationHistoryState {
      return {
        undoDepth: undoStack.length,
        redoDepth: redoStack.length
      }
    },
    canUndo() {
      return undoStack.length > 0
    },
    canRedo() {
      return redoStack.length > 0
    }
  }
}
