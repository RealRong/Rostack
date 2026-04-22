import type {
  QueryState
} from '@dataview/engine/contracts/query'
import {
  emptyQueryState
} from '@dataview/engine/contracts/query'
import type {
  MembershipState
} from '@dataview/engine/contracts/membership'
import {
  emptyMembershipState
} from '@dataview/engine/contracts/membership'
import type {
  SummaryState
} from '@dataview/engine/contracts/summary'
import {
  emptySummaryState
} from '@dataview/engine/contracts/summary'
import type {
  ItemIdPool
} from '@dataview/engine/contracts/shared'
import {
  createItemIdPool
} from '@dataview/engine/active/shared/itemIdPool'

export interface QueryRuntime {
  state: QueryState
}

export interface MembershipRuntime {
  state: MembershipState
}

export interface SummaryRuntime {
  state: SummaryState
}

export interface PublishRuntime {
  itemIds: ItemIdPool
}

export interface ViewCache {
  query: QueryRuntime
  membership: MembershipRuntime
  summary: SummaryRuntime
  publish: PublishRuntime
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
  },
  publish: {
    itemIds: createItemIdPool()
  }
})
