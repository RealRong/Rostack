import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import type {
  ActionResult,
  CommitResult
} from '@dataview/engine/contracts/api'
import type {
  EngineChange
} from '@dataview/engine/contracts/change'
import type {
  HistoryState
} from '@dataview/engine/contracts/history'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

export type ActiveSnapshot = ViewState

export interface EngineSnapshot {
  doc: DataDoc
  active?: ActiveSnapshot
}

export interface EngineResult {
  rev: number
  snapshot: EngineSnapshot
  change?: EngineChange
}

export interface EngineCoreRead {
  result: () => EngineResult
  snapshot: () => EngineSnapshot
  change: () => EngineChange | undefined
  document: () => DataDoc
  active: () => ActiveSnapshot | undefined
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
