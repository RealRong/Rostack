import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  ViewRecords
} from '@dataview/engine/contracts/shared'

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

export interface QueryDelta {
  rebuild: boolean
  added: readonly RecordId[]
  removed: readonly RecordId[]
  orderChanged: boolean
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
