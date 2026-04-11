import type { DataDoc } from '@dataview/core/contracts'
import type { HistoryActionResult } from './command'

export interface HistoryState {
  capacity: number
  undoDepth: number
  redoDepth: number
}

export interface HistoryOptions {
  capacity?: number
}

export interface EngineHistoryApi {
  state: () => HistoryState
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => HistoryActionResult
  redo: () => HistoryActionResult
  clear: () => void
}

export interface EngineDocumentApi {
  export: () => DataDoc
  replace: (document: DataDoc) => DataDoc
}
