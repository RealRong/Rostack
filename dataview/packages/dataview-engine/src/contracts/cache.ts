import type {
  ItemProjectionCache
} from '@dataview/engine/contracts/membership'
import type {
  QueryDelta,
  QueryState
} from '@dataview/engine/contracts/query'
import {
  emptyQueryState
} from '@dataview/engine/contracts/query'
import type {
  MembershipDelta,
  MembershipRuntimeState
} from '@dataview/engine/contracts/membership'
import {
  emptyMembershipRuntimeState
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
  state: MembershipRuntimeState['structure']
  projection: ItemProjectionCache
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
    state: emptyMembershipRuntimeState().structure,
    projection: emptyMembershipRuntimeState().projection
  },
  summary: {
    state: emptySummaryState()
  }
})
