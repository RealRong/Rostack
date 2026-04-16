import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  AggregateState
} from '@dataview/engine/active/index/contracts'
import type {
  SectionBucket,
  SectionKey,
  ViewRecords
} from '@dataview/engine/contracts/shared'
import {
  EMPTY_SUMMARY_STATE as EMPTY_INTERNAL_SUMMARY_STATE
} from '@dataview/engine/summary/empty'
export type {
  ActiveRuntimeState,
  EngineRuntimeState,
  HistoryEntry,
  RuntimeHistory
} from '@dataview/engine/runtime/state'

export interface QueryState {
  records: ViewRecords
  visibleSet?: ReadonlySet<RecordId>
  order?: ReadonlyMap<RecordId, number>
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
  collapsed: boolean
  recordIds: readonly RecordId[]
  visible: boolean
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

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_VIEW_RECORDS: ViewRecords = {
  matched: EMPTY_RECORD_IDS,
  ordered: EMPTY_RECORD_IDS,
  visible: EMPTY_RECORD_IDS
}

export const emptyQueryState = (): QueryState => ({
  records: EMPTY_VIEW_RECORDS
})

export const emptySectionState = (): SectionState => ({
  order: [],
  byKey: new Map(),
  byRecord: new Map()
})

export const emptySummaryState = (): SummaryState => EMPTY_INTERNAL_SUMMARY_STATE

export const emptyViewCache = (): ViewCache => ({
  query: emptyQueryState(),
  sections: emptySectionState(),
  summary: emptySummaryState()
})

export const emptyViewRecords = (): ViewRecords => EMPTY_VIEW_RECORDS

export const readQueryVisibleSet = (
  state: QueryState
): ReadonlySet<RecordId> => {
  if (!state.visibleSet) {
    state.visibleSet = new Set(state.records.visible)
  }

  return state.visibleSet
}

export const readQueryOrder = (
  state: QueryState
): ReadonlyMap<RecordId, number> => {
  if (!state.order) {
    const order = new Map<RecordId, number>()
    for (let index = 0; index < state.records.ordered.length; index += 1) {
      order.set(state.records.ordered[index]!, index)
    }
    state.order = order
  }

  return state.order
}
