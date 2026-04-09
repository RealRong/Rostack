import type {
  CommitDelta,
  DataDoc
} from '@dataview/core/contracts'
import {
  buildCalculationIndex,
  syncCalculationIndex
} from './calculations'
import {
  buildGroupIndex,
  syncGroupIndex
} from './group'
import {
  buildRecordIndex,
  syncRecordIndex
} from './records'
import {
  buildSearchIndex,
  syncSearchIndex
} from './search'
import {
  buildSortIndex,
  syncSortIndex
} from './sort'
import type {
  IndexState
} from './types'

export interface EngineIndex {
  state: () => IndexState
  sync: (document: DataDoc, delta: CommitDelta) => IndexState
}

const buildIndexState = (
  document: DataDoc
): IndexState => {
  const records = buildRecordIndex(document)
  const group = buildGroupIndex(document, records)

  return {
    records,
    search: buildSearchIndex(document, records),
    group,
    sort: buildSortIndex(document, records),
    calculations: buildCalculationIndex(document, records, group)
  }
}

export const createEngineIndex = (
  document: DataDoc
): EngineIndex => {
  let current = buildIndexState(document)

  return {
    state: () => current,
    sync: (nextDocument, delta) => {
      const records = syncRecordIndex(current.records, nextDocument, delta)
      const group = syncGroupIndex(current.group, nextDocument, records, delta)
      current = {
        records,
        search: syncSearchIndex(current.search, nextDocument, records, delta),
        group,
        sort: syncSortIndex(current.sort, nextDocument, records, delta),
        calculations: syncCalculationIndex(current.calculations, nextDocument, records, group, delta)
      }
      return current
    }
  }
}
