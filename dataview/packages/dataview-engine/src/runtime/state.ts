import type { DataDoc } from '@dataview/core/contracts'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import type {
  IndexState,
  NormalizedIndexDemand
} from '#engine/active/index/contracts.ts'
import type { ViewCache } from '#engine/contracts/internal.ts'
import type { ViewState } from '#engine/contracts/public.ts'

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
