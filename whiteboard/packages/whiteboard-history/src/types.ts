import { store } from '@shared/core'
import type {
  EngineHistoryConfig,
  IntentResult
} from '@whiteboard/engine'

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
  undo: () => IntentResult
  redo: () => IntentResult
  clear: () => void
}

export type HistoryBinding = HistoryApi & {
  set: (next: HistoryApi) => void
  reset: () => void
}

export type LocalEngineHistoryConfig = EngineHistoryConfig
