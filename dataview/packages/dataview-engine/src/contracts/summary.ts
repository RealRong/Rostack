import type {
  FieldReducerState
} from '@dataview/core/calculation'
import type {
  FieldId
} from '@dataview/core/contracts'
import type {
  SectionKey
} from '@dataview/engine/contracts/shared'
import {
  EMPTY_SUMMARY_STATE
} from '@dataview/engine/summary/empty'

export interface SummaryState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>
}

export interface SummaryDelta {
  rebuild: boolean
  changed: readonly SectionKey[]
  removed: readonly SectionKey[]
}

export const emptySummaryState = (): SummaryState => EMPTY_SUMMARY_STATE
