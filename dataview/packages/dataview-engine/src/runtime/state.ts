import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { ViewCache } from '@dataview/engine/contracts/state'
import type {
  EnginePatch,
  ViewState
} from '@dataview/engine/contracts'

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
  plan?: ViewPlan
  index: IndexState
  cache: ViewCache
  snapshot?: ViewState
  patch: EnginePatch
}

export interface EngineRuntimeState {
  rev: number
  doc: DataDoc
  history: RuntimeHistory
  currentView: ActiveRuntimeState
}
