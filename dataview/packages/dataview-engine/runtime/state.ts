import type { DataDoc } from '@dataview/core/contracts'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import type {
  IndexState,
  NormalizedIndexDemand
} from '../active/index/contracts'
import type { ViewCache } from '../contracts/internal'
import type { ViewState } from '../contracts/public'

export interface HistoryEntry {
  undo: BaseOperation[]
  redo: BaseOperation[]
}

export interface RuntimeHistory {
  cap: number
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

export interface ActiveRuntimeState {
  demand: NormalizedIndexDemand
  index: IndexState
  cache: ViewCache
  snapshot?: ViewState
}

export interface EngineRuntimeState {
  rev: number
  doc: DataDoc
  history: RuntimeHistory
  currentView: ActiveRuntimeState
}
