import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import type {
  ActionResult,
  CommitResult
} from '@dataview/engine/contracts/result'
import type {
  HistoryState
} from '@dataview/engine/contracts/history'
import type {
  EngineDelta
} from '@dataview/engine/contracts/delta'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

export interface EngineSnapshot {
  doc: DataDoc
  active?: ViewState
}

export interface EngineResult {
  rev: number
  snapshot: EngineSnapshot
  delta?: EngineDelta
}

export interface EngineCoreRead {
  result: () => EngineResult
}

export interface EngineCoreCommit {
  actions: (actions: readonly Action[]) => ActionResult
  replace: (document: DataDoc) => CommitResult
  undo: () => CommitResult
  redo: () => CommitResult
  clearHistory: () => void
}

export interface EngineCoreHistory {
  state: () => HistoryState
  canUndo: () => boolean
  canRedo: () => boolean
}

export interface EngineCore {
  read: EngineCoreRead
  commit: EngineCoreCommit
  history: EngineCoreHistory
  subscribe: (listener: (result: EngineResult) => void) => () => void
}
