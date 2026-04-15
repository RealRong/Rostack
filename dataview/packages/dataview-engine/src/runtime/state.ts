import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type {
  IndexState,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import type { ViewCache } from '@dataview/engine/contracts/internal'
import type { ViewState } from '@dataview/engine/contracts/public'

export interface HistoryEntry {
  undo: DocumentOperation[]
  redo: DocumentOperation[]
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
