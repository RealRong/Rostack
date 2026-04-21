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

export interface ViewCache {
  query: QueryState
  sections: SectionRuntimeState
  summary: SummaryState
}

export const emptyViewCache = (): ViewCache => ({
  query: emptyQueryState(),
  sections: emptySectionRuntimeState(),
  summary: emptySummaryState()
})
