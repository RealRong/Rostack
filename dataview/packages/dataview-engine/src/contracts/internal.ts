import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  FieldReducerState
} from '@dataview/engine/active/shared/calculation'
import type {
  CalculationEntry
} from '@dataview/engine/active/shared/calculation'
import type {
  Token
} from '@shared/i18n'
import type {
  ItemProjectionCache,
} from '@dataview/engine/active/shared/itemIdentity'
import {
  emptyItemProjectionCache
} from '@dataview/engine/active/shared/itemIdentity'
import type {
  SectionBucket,
  SectionKey,
  ViewRecords
} from '@dataview/engine/contracts/shared'
import {
  EMPTY_SUMMARY_STATE as EMPTY_INTERNAL_SUMMARY_STATE
} from '@dataview/engine/summary/empty'
export type {
  ItemProjectionCache
} from '@dataview/engine/active/shared/itemIdentity'
export type {
  ActiveRuntimeState,
  EngineRuntimeState,
  HistoryEntry,
  RuntimeHistory
} from '@dataview/engine/runtime/state'

export interface QueryState {
  plan: {
    executionKey: string
    watch: {
      search: readonly FieldId[] | 'all'
      filter: readonly FieldId[]
      sort: readonly FieldId[]
    }
  }
  records: ViewRecords
  search?: {
    query: string
    sourceKey: string
    sourceRevisionKey: string
    matched: readonly RecordId[]
  }
  visibleSet?: ReadonlySet<RecordId>
  order?: ReadonlyMap<RecordId, number>
}

export type DeriveAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export interface SectionNodeState {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  recordIds: readonly RecordId[]
  visible: boolean
}

export interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNodeState>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface SummaryState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>
}

export interface SummaryRecordDelta {
  recordId: RecordId
  previous?: CalculationEntry
  next?: CalculationEntry
}

export interface SummaryFieldDelta {
  changes: readonly SummaryRecordDelta[]
}

export interface SummaryDelta {
  rebuild: boolean
  changed: readonly SectionKey[]
  removed: readonly SectionKey[]
  fields: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, SummaryFieldDelta>>
}

export interface ViewCache {
  query: QueryState
  sections: SectionState
  summary: SummaryState
  items: ItemProjectionCache
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_VIEW_RECORDS: ViewRecords = {
  matched: EMPTY_RECORD_IDS,
  ordered: EMPTY_RECORD_IDS,
  visible: EMPTY_RECORD_IDS
}

export const emptyQueryState = (): QueryState => ({
  plan: {
    executionKey: '',
    watch: {
      search: [],
      filter: [],
      sort: []
    }
  },
  records: EMPTY_VIEW_RECORDS
})

export const emptySectionState = (): SectionState => ({
  order: [],
  byKey: new Map(),
  keysByRecord: new Map()
})

export const emptySummaryState = (): SummaryState => EMPTY_INTERNAL_SUMMARY_STATE

export const emptyViewCache = (): ViewCache => ({
  query: emptyQueryState(),
  sections: emptySectionState(),
  summary: emptySummaryState(),
  items: emptyItemProjectionCache()
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
