import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Selection
} from '@dataview/engine/active/shared/selection'
import {
  EMPTY_SELECTION
} from '@dataview/engine/active/shared/selection'

export interface QueryState {
  matched: Selection
  ordered: Selection
  visible: Selection
  search?: {
    query: string
    sourceKey: string
    sourceRevisionKey: string
    matched: readonly RecordId[]
  }
}

export interface QueryDelta {
  rebuild: boolean
  added: readonly RecordId[]
  removed: readonly RecordId[]
  orderChanged: boolean
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
export const emptyQueryState = (): QueryState => ({
  matched: EMPTY_SELECTION,
  ordered: EMPTY_SELECTION,
  visible: EMPTY_SELECTION
})
