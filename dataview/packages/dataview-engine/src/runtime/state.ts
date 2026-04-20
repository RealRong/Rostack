import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type {
  IndexState,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { ViewCache } from '@dataview/engine/contracts/internal'
import type {
  SourceDelta,
  TableLayoutState,
  ViewPublishDelta,
  ViewState
} from '@dataview/engine/contracts/public'

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
  demand: NormalizedIndexDemand
  index: IndexState
  cache: ViewCache
  snapshot?: ViewState
  publishDelta?: ViewPublishDelta
  sourceDelta: SourceDelta
  tableLayout: TableLayoutState | null
}

export interface EngineRuntimeState {
  rev: number
  doc: DataDoc
  history: RuntimeHistory
  currentView: ActiveRuntimeState
}
