import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  SectionAggregateState
} from '#engine/active/index/contracts.ts'
import type {
  Section,
  SectionKey,
  ViewRecords,
  ViewSummaries
} from '#engine/contracts/shared.ts'
export type {
  ActiveRuntimeState,
  EngineRuntimeState,
  HistoryEntry,
  RuntimeHistory
} from '#engine/runtime/state.ts'

export interface QueryState extends ViewRecords {
  visibleSet?: ReadonlySet<RecordId>
  order?: ReadonlyMap<RecordId, number>
}

export type DeriveAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export interface SectionNodeState extends Section {
  visible: boolean
}

export interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNodeState>
  byRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface SummaryState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>
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

const EMPTY_SUMMARY_BY_SECTION = new Map<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>()
const EMPTY_SUMMARY_STATE: SummaryState = {
  bySection: EMPTY_SUMMARY_BY_SECTION
}

export const emptyQueryState = (): QueryState => ({
  ...EMPTY_VIEW_RECORDS
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

export const emptyViewRecords = (): ViewRecords => EMPTY_VIEW_RECORDS

export const emptySummaries = (): ViewSummaries => new Map()

export const readQueryVisibleSet = (
  state: QueryState
): ReadonlySet<RecordId> => {
  if (!state.visibleSet) {
    state.visibleSet = new Set(state.visible)
  }

  return state.visibleSet
}

export const readQueryOrder = (
  state: QueryState
): ReadonlyMap<RecordId, number> => {
  if (!state.order) {
    state.order = new Map(
      state.ordered.map((id, index) => [id, index] as const)
    )
  }

  return state.order
}
