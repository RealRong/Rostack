import { createItemIdPool } from '@dataview/engine/active/shared/itemIdPool'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA,
  EMPTY_QUERY_PHASE_DELTA,
  EMPTY_SUMMARY_PHASE_DELTA,
  emptyMembershipPhaseState,
  emptyQueryPhaseState,
  emptySummaryPhaseState
} from '@dataview/engine/active/state'
import type { ActiveRuntimeWorking } from './runtime'

const EMPTY_RECORD_IDS = [] as const

export const EMPTY_VIEW_RECORDS = {
  matched: EMPTY_RECORD_IDS,
  ordered: EMPTY_RECORD_IDS,
  visible: EMPTY_RECORD_IDS
} as const
export {
  EMPTY_QUERY_PHASE_DELTA,
  EMPTY_MEMBERSHIP_PHASE_DELTA,
  EMPTY_SUMMARY_PHASE_DELTA
}

export const createActiveRuntimeWorking = (): ActiveRuntimeWorking => {
  const membershipState = emptyMembershipPhaseState()
  const summaryState = emptySummaryPhaseState()

  return {
    query: {
      state: emptyQueryPhaseState(),
      records: EMPTY_VIEW_RECORDS,
      delta: EMPTY_QUERY_PHASE_DELTA,
      runId: 0
    },
    membership: {
      state: membershipState,
      previousState: membershipState,
      delta: EMPTY_MEMBERSHIP_PHASE_DELTA,
      action: 'reuse',
      runId: 0
    },
    summary: {
      state: summaryState,
      previousState: summaryState,
      delta: EMPTY_SUMMARY_PHASE_DELTA,
      runId: 0
    },
    publish: {
      itemIds: createItemIdPool()
    }
  }
}

export const resetActiveRuntimeWorking = (
  working: ActiveRuntimeWorking
): void => {
  const membershipState = emptyMembershipPhaseState()
  const summaryState = emptySummaryPhaseState()

  working.query.state = emptyQueryPhaseState()
  working.query.records = EMPTY_VIEW_RECORDS
  working.query.delta = EMPTY_QUERY_PHASE_DELTA

  working.membership.state = membershipState
  working.membership.previousState = membershipState
  working.membership.delta = EMPTY_MEMBERSHIP_PHASE_DELTA
  working.membership.action = 'reuse'

  working.summary.state = summaryState
  working.summary.previousState = summaryState
  working.summary.delta = EMPTY_SUMMARY_PHASE_DELTA

  working.publish.itemIds.gc.clear()
  working.publish.snapshot = undefined
  working.publish.delta = undefined
}
