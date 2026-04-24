import { createItemIdPool } from '@dataview/engine/active/shared/itemIdPool'
import {
  emptyMembershipPhaseState,
  emptyQueryPhaseState,
  emptySummaryPhaseState
} from '@dataview/engine/active/state'
import type { ActiveProjectorWorking } from '../contracts/projector'

export const createActiveProjectorWorking = (): ActiveProjectorWorking => ({
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
