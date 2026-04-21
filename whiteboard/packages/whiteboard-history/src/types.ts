import { store } from '@shared/core'
import type { CommandResult } from '@whiteboard/engine/types/result'

export type HistoryState = {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
  lastUpdatedAt?: number
}

export type HistoryApi = store.ReadStore<HistoryState> & {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type HistoryBinding = HistoryApi & {
  set: (next: HistoryApi) => void
  reset: () => void
}

export type LocalEngineHistoryConfig = {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}
