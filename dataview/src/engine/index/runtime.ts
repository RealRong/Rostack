import type {
  CommitDelta,
  DataDoc,
  FieldId
} from '@dataview/core/contracts'
import type {
  IndexStageTrace,
  IndexTrace
} from '../types'
import {
  buildCalculationIndex,
  ensureCalculationIndex,
  syncCalculationIndex
} from './calculations'
import {
  normalizeIndexDemand,
  sameFieldIdList,
  sameGroupDemand,
  sameSearchDemand,
  type NormalizedIndexDemand
} from './demand'
import {
  buildGroupIndex,
  ensureGroupIndex,
  syncGroupIndex
} from './group'
import {
  buildRecordIndex,
  syncRecordIndex
} from './records'
import {
  buildSearchIndex,
  ensureSearchIndex,
  syncSearchIndex
} from './search'
import {
  buildSortIndex,
  ensureSortIndex,
  syncSortIndex
} from './sort'
import type {
  GroupDemand,
  IndexDemand,
  IndexState
} from './types'
import {
  createIndexStageTrace,
  fullRebuildFrom,
  searchEntryCountOf,
  touchedFieldCountOf,
  touchedRecordCountOf
} from './trace'
import {
  now
} from '../perf/shared'

export interface EngineIndex {
  state: () => IndexState
  sync: (document: DataDoc, delta: CommitDelta, demand?: IndexDemand) => IndexSyncResult
}

export interface IndexSyncResult {
  state: IndexState
  trace?: IndexTrace
}

const buildIndexState = (
  document: DataDoc,
  demand?: IndexDemand
): IndexState => {
  const normalized = normalizeIndexDemand(demand)
  const records = buildRecordIndex(document)

  return {
    records,
    search: buildSearchIndex(document, records, normalized.search),
    group: buildGroupIndex(document, records, normalized.groups),
    sort: buildSortIndex(document, records, normalized.sortFields),
    calculations: buildCalculationIndex(document, records, normalized.calculationFields)
  }
}

export const createEngineIndex = (
  document: DataDoc,
  demand?: IndexDemand
): EngineIndex => {
  let current = buildIndexState(document, demand)
  let currentDemand = normalizeIndexDemand(demand)

  return {
    state: () => current,
    sync: (nextDocument, delta, demandForSync) => {
      const previous = current
      const nextDemand = demandForSync
        ? normalizeIndexDemand(demandForSync)
        : currentDemand
      const totalStart = now()
      const touchedRecordCount = touchedRecordCountOf(delta)
      const touchedFieldCount = touchedFieldCountOf(delta)
      const rebuild = fullRebuildFrom(delta)

      const recordsStart = now()
      const records = syncRecordIndex(previous.records, nextDocument, delta)
      const recordsMs = now() - recordsStart

      const searchStart = now()
      const search = sameSearchDemand(currentDemand.search, nextDemand.search)
        ? ensureSearchIndex(
            syncSearchIndex(previous.search, nextDocument, records, delta),
            nextDocument,
            records,
            nextDemand.search
          )
        : buildSearchIndex(nextDocument, records, nextDemand.search, previous.search.rev + 1)
      const searchMs = now() - searchStart

      const groupStart = now()
      const group = sameGroupDemand(currentDemand.groups, nextDemand.groups)
        ? ensureGroupIndex(
            syncGroupIndex(previous.group, nextDocument, records, delta),
            nextDocument,
            records,
            nextDemand.groups
          )
        : buildGroupIndex(nextDocument, records, nextDemand.groups, previous.group.rev + 1)
      const groupMs = now() - groupStart

      const sortStart = now()
      const sort = sameFieldIdList(currentDemand.sortFields, nextDemand.sortFields)
        ? ensureSortIndex(
            syncSortIndex(previous.sort, nextDocument, records, delta),
            nextDocument,
            records,
            nextDemand.sortFields
          )
        : buildSortIndex(nextDocument, records, nextDemand.sortFields, previous.sort.rev + 1)
      const sortMs = now() - sortStart

      const calculationsStart = now()
      const calculations = sameFieldIdList(currentDemand.calculationFields, nextDemand.calculationFields)
        ? ensureCalculationIndex(
            syncCalculationIndex(previous.calculations, nextDocument, records, delta),
            nextDocument,
            records,
            nextDemand.calculationFields
          )
        : buildCalculationIndex(
            nextDocument,
            records,
            nextDemand.calculationFields,
            previous.calculations.rev + 1
          )
      const calculationsMs = now() - calculationsStart

      currentDemand = nextDemand
      current = {
        records,
        search,
        group,
        sort,
        calculations
      }

      return {
        state: current,
        trace: {
          changed: (
            records !== previous.records
            || search !== previous.search
            || group !== previous.group
            || sort !== previous.sort
            || calculations !== previous.calculations
          ),
          timings: {
            totalMs: now() - totalStart,
            recordsMs,
            searchMs,
            groupMs,
            sortMs,
            calculationsMs
          },
          records: createIndexStageTrace({
            previous: previous.records,
            next: records,
            rebuild,
            durationMs: recordsMs,
            inputSize: previous.records.ids.length,
            outputSize: records.ids.length,
            touchedRecordCount,
            touchedFieldCount
          }),
          search: createIndexStageTrace({
            previous: previous.search,
            next: search,
            rebuild,
            durationMs: searchMs,
            inputSize: searchEntryCountOf(previous.search),
            outputSize: searchEntryCountOf(search),
            touchedRecordCount,
            touchedFieldCount
          }),
          group: createIndexStageTrace({
            previous: previous.group,
            next: group,
            rebuild,
            durationMs: groupMs,
            inputSize: previous.group.groups.size,
            outputSize: group.groups.size,
            touchedRecordCount,
            touchedFieldCount
          }),
          sort: createIndexStageTrace({
            previous: previous.sort,
            next: sort,
            rebuild,
            durationMs: sortMs,
            inputSize: previous.sort.fields.size,
            outputSize: sort.fields.size,
            touchedRecordCount,
            touchedFieldCount
          }),
          calculations: createIndexStageTrace({
            previous: previous.calculations,
            next: calculations,
            rebuild,
            durationMs: calculationsMs,
            inputSize: previous.calculations.fields.size,
            outputSize: calculations.fields.size,
            touchedRecordCount,
            touchedFieldCount
          })
        }
      }
    }
  }
}
