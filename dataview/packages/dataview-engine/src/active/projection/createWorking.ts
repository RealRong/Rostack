import { createItemIdPool } from '@dataview/engine/active/publish/itemIdPool'
import {
  emptyMembershipPhaseState,
  emptyQueryPhaseState,
  emptySummaryPhaseState
} from '@dataview/engine/active/state'
import type { ActiveProjectionWorking } from './types'

export const createActiveProjectionWorking = (): ActiveProjectionWorking => ({
  query: {
    state: emptyQueryPhaseState()
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
