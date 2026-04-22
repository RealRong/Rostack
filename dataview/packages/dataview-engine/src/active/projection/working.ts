import { createItemIdPool } from '@dataview/engine/active/shared/itemIdPool'
import { emptyMembershipState } from '@dataview/engine/contracts/membership'
import { emptyQueryState } from '@dataview/engine/contracts/query'
import { emptySummaryState } from '@dataview/engine/contracts/summary'
import type { ActiveProjectionWorking } from './contracts'

const EMPTY_RECORD_IDS = [] as const

export const EMPTY_VIEW_RECORDS = {
  matched: EMPTY_RECORD_IDS,
  ordered: EMPTY_RECORD_IDS,
  visible: EMPTY_RECORD_IDS
} as const

export const EMPTY_QUERY_DELTA = {
  rebuild: false,
  added: EMPTY_RECORD_IDS,
  removed: EMPTY_RECORD_IDS,
  orderChanged: false
} as const

export const EMPTY_MEMBERSHIP_DELTA = {
  rebuild: false,
  orderChanged: false,
  removed: EMPTY_RECORD_IDS,
  changed: EMPTY_RECORD_IDS,
  records: new Map()
} as const

export const EMPTY_SUMMARY_DELTA = {
  rebuild: false,
  changed: EMPTY_RECORD_IDS,
  removed: EMPTY_RECORD_IDS
} as const

export const createActiveProjectionWorking = (): ActiveProjectionWorking => {
  const membershipState = emptyMembershipState()
  const summaryState = emptySummaryState()

  return {
    query: {
      state: emptyQueryState(),
      records: EMPTY_VIEW_RECORDS,
      delta: EMPTY_QUERY_DELTA,
      runId: 0
    },
    membership: {
      state: membershipState,
      previousState: membershipState,
      delta: EMPTY_MEMBERSHIP_DELTA,
      action: 'reuse',
      runId: 0
    },
    summary: {
      state: summaryState,
      previousState: summaryState,
      delta: EMPTY_SUMMARY_DELTA,
      runId: 0
    },
    publish: {
      itemIds: createItemIdPool()
    }
  }
}

export const resetActiveProjectionWorking = (
  working: ActiveProjectionWorking
): void => {
  const membershipState = emptyMembershipState()
  const summaryState = emptySummaryState()

  working.query.state = emptyQueryState()
  working.query.records = EMPTY_VIEW_RECORDS
  working.query.delta = EMPTY_QUERY_DELTA

  working.membership.state = membershipState
  working.membership.previousState = membershipState
  working.membership.delta = EMPTY_MEMBERSHIP_DELTA
  working.membership.action = 'reuse'

  working.summary.state = summaryState
  working.summary.previousState = summaryState
  working.summary.delta = EMPTY_SUMMARY_DELTA

  working.publish.itemIds.gc.clear()
  working.publish.snapshot = undefined
  working.publish.delta = undefined
}
