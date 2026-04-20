import type { CommitResult } from '@dataview/engine/contracts/api'

export interface HistoryState {
  capacity: number
  undoDepth: number
  redoDepth: number
}

export interface HistoryOptions {
  capacity?: number
}

export interface HistoryApi {
  state: () => HistoryState
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => CommitResult
  redo: () => CommitResult
  clear: () => void
}
