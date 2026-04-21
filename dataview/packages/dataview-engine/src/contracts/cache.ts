import type {
  QueryDelta,
  QueryState
} from '@dataview/engine/contracts/query'
import {
  emptyQueryState
} from '@dataview/engine/contracts/query'
import type {
  MembershipDelta,
  MembershipState
} from '@dataview/engine/contracts/membership'
import {
  emptyMembershipState
} from '@dataview/engine/contracts/membership'
import type {
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/summary'
import {
  emptySummaryState
} from '@dataview/engine/contracts/summary'

export interface SnapshotChange {
  query: QueryDelta
  membership: MembershipDelta
  summary: SummaryDelta
}

export interface QueryRuntime {
  state: QueryState
}

export interface MembershipRuntime {
  state: MembershipState
}

export interface SummaryRuntime {
  state: SummaryState
}

export interface ViewCache {
  query: QueryRuntime
  membership: MembershipRuntime
  summary: SummaryRuntime
}

export const emptyViewCache = (): ViewCache => ({
  query: {
    state: emptyQueryState()
  },
  membership: {
    state: emptyMembershipState()
  },
  summary: {
    state: emptySummaryState()
  }
})
