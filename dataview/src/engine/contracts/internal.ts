import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type { NormalizedIndexDemand } from '../index/demand'
import type { AggregateState, IndexState } from '../index/types'
import type {
  SectionBucket,
  SectionKey,
  ViewRecords,
  ViewState
} from './public'

export interface HistoryEntry {
  undo: import('@dataview/core/contracts/operations').BaseOperation[]
  redo: import('@dataview/core/contracts/operations').BaseOperation[]
}

export interface History {
  cap: number
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

export interface QueryState {
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
  visibleSet: ReadonlySet<RecordId>
  order: ReadonlyMap<RecordId, number>
}

export type DeriveAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export interface SectionNodeState {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  recordIds: readonly RecordId[]
  visible: boolean
  collapsed: boolean
}

export interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNodeState>
  byRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface SummaryState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, AggregateState>>
}

export interface ViewCache {
  query: QueryState
  sections: SectionState
  summary: SummaryState
}

export interface CurrentViewState {
  demand: NormalizedIndexDemand
  index: IndexState
  cache: ViewCache
  snapshot?: ViewState
}

export interface EngineState {
  rev: number
  doc: DataDoc
  history: History
  currentView: CurrentViewState
}

const EMPTY_SUMMARY_BY_SECTION = new Map<SectionKey, ReadonlyMap<FieldId, AggregateState>>()
const EMPTY_SUMMARY_STATE: SummaryState = {
  bySection: EMPTY_SUMMARY_BY_SECTION
}

export const emptyQueryState = (): QueryState => ({
  matched: [],
  ordered: [],
  visible: [],
  visibleSet: new Set(),
  order: new Map()
})

export const emptySectionState = (): SectionState => ({
  order: [],
  byKey: new Map(),
  byRecord: new Map()
})

export const emptySummaryState = (): SummaryState => EMPTY_SUMMARY_STATE

export const emptyViewCache = (): ViewCache => ({
  query: emptyQueryState(),
  sections: emptySectionState(),
  summary: emptySummaryState()
})

export const emptyViewRecords = (): ViewRecords => ({
  matched: [],
  ordered: [],
  visible: []
})

export const emptySummaries = (): ReadonlyMap<SectionKey, CalculationCollection> => new Map()
