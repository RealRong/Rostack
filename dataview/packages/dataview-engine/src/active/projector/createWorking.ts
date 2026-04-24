import { createItemIdPool } from '@dataview/engine/active/shared/itemIdPool'
import {
  emptyMembershipPhaseState,
  emptyQueryPhaseState,
  emptySummaryPhaseState
} from '@dataview/engine/active/state'
import type { ActiveProjectorWorking } from '../contracts/projector'

const EMPTY_RECORD_IDS = [] as const

export const EMPTY_VIEW_RECORDS = {
  matched: EMPTY_RECORD_IDS,
  ordered: EMPTY_RECORD_IDS,
  visible: EMPTY_RECORD_IDS
} as const

export const createActiveProjectorWorking = (): ActiveProjectorWorking => ({
  query: {
    state: emptyQueryPhaseState(),
    records: EMPTY_VIEW_RECORDS
  },
  membership: {
    state: emptyMembershipPhaseState()
  },
  summary: {
    state: emptySummaryPhaseState()
  },
  publish: {
    itemIds: createItemIdPool()
  }
})
