import type {
  ItemProjectionCache
} from '@dataview/engine/contracts/sections'
import type {
  QueryDelta,
  QueryState
} from '@dataview/engine/contracts/query'
import {
  emptyQueryState
} from '@dataview/engine/contracts/query'
import type {
  SectionDelta,
  SectionRuntimeState
} from '@dataview/engine/contracts/sections'
import {
  emptySectionRuntimeState
} from '@dataview/engine/contracts/sections'
import type {
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/summary'
import {
  emptySummaryState
} from '@dataview/engine/contracts/summary'

export interface SnapshotChange {
  query: QueryDelta
  sections: SectionDelta
  summary: SummaryDelta
}

export interface QueryRuntime {
  state: QueryState
}

export interface SectionsRuntime {
  state: SectionRuntimeState['structure']
  projection: ItemProjectionCache
}

export interface SummaryRuntime {
  state: SummaryState
}

export interface ViewCache {
  query: QueryRuntime
  sections: SectionsRuntime
  summary: SummaryRuntime
}

export const emptyViewCache = (): ViewCache => ({
  query: {
    state: emptyQueryState()
  },
  sections: {
    state: emptySectionRuntimeState().structure,
    projection: emptySectionRuntimeState().projection
  },
  summary: {
    state: emptySummaryState()
  }
})
