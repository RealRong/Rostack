import type { DataDoc } from '@dataview/core/contracts'
import type { HistoryActionResult } from './command'
import type { HistoryState } from '../../history'

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
