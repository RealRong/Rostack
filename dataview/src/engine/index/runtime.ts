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
  IndexDemand,
  IndexState
} from './types'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from './shared'
import {
  now
} from '../perf/shared'

interface NormalizedIndexDemand {
  search: {
    all: boolean
    fields: readonly FieldId[]
  }
  groupFields: readonly FieldId[]
  sortFields: readonly FieldId[]
  calculationFields: readonly FieldId[]
}

export interface EngineIndex {
  state: () => IndexState
  sync: (document: DataDoc, delta: CommitDelta, demand?: IndexDemand) => IndexSyncResult
}

export interface IndexSyncResult {
  state: IndexState
  trace?: IndexTrace
}

const fullRebuildFrom = (
  delta: CommitDelta
) => (
  delta.entities.records?.update === 'all'
  || delta.entities.fields?.update === 'all'
  || delta.entities.values?.records === 'all'
  || delta.entities.values?.fields === 'all'
)

const touchedRecordCountOf = (
  delta: CommitDelta
): number | 'all' | undefined => {
  const touched = collectTouchedRecordIds(delta)
  return touched === 'all'
    ? 'all'
    : touched.size || undefined
}

const touchedFieldCountOf = (
  delta: CommitDelta
): number | 'all' | undefined => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
  ) {
    return 'all'
  }

  const touched = new Set([
    ...collectSchemaFieldIds(delta),
    ...collectValueFieldIds(delta, { includeTitlePatch: true })
  ])
  return touched.size || undefined
}

const createIndexStageTrace = (input: {
  previous: unknown
  next: unknown
  rebuild: boolean
  durationMs: number
  inputSize?: number
  outputSize?: number
  touchedRecordCount?: number | 'all'
  touchedFieldCount?: number | 'all'
}): IndexStageTrace => ({
  action: input.previous === input.next
    ? 'reuse'
    : input.rebuild
      ? 'rebuild'
      : 'sync',
  changed: input.previous !== input.next,
  ...(input.inputSize === undefined ? {} : { inputSize: input.inputSize }),
  ...(input.outputSize === undefined ? {} : { outputSize: input.outputSize }),
  ...(input.touchedRecordCount === undefined ? {} : { touchedRecordCount: input.touchedRecordCount }),
  ...(input.touchedFieldCount === undefined ? {} : { touchedFieldCount: input.touchedFieldCount }),
  durationMs: input.durationMs
})

const uniqueSorted = (
  values: readonly FieldId[] = []
): readonly FieldId[] => Array.from(new Set(values)).sort()

const normalizeDemand = (
  demand?: IndexDemand
): NormalizedIndexDemand => ({
  search: {
    all: demand?.search?.all === true,
    fields: uniqueSorted(demand?.search?.fields)
  },
  groupFields: uniqueSorted(demand?.groupFields),
  sortFields: uniqueSorted(demand?.sortFields),
  calculationFields: uniqueSorted(demand?.calculationFields)
})

const sameList = (
  left: readonly FieldId[],
  right: readonly FieldId[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const sameDemand = (
  left: NormalizedIndexDemand,
  right: NormalizedIndexDemand
) => left.search.all === right.search.all
  && sameList(left.search.fields, right.search.fields)
  && sameList(left.groupFields, right.groupFields)
  && sameList(left.sortFields, right.sortFields)
  && sameList(left.calculationFields, right.calculationFields)

const sameSearchDemand = (
  left: NormalizedIndexDemand['search'],
  right: NormalizedIndexDemand['search']
) => left.all === right.all
  && sameList(left.fields, right.fields)

const buildIndexState = (
  document: DataDoc,
  demand?: IndexDemand
): IndexState => {
  const normalized = normalizeDemand(demand)
  const records = buildRecordIndex(document)

  return {
    records,
    search: buildSearchIndex(document, records, normalized.search),
    group: buildGroupIndex(document, records, normalized.groupFields),
    sort: buildSortIndex(document, records, normalized.sortFields),
    calculations: buildCalculationIndex(document, records, normalized.calculationFields)
  }
}

export const createEngineIndex = (
  document: DataDoc,
  demand?: IndexDemand
): EngineIndex => {
  let current = buildIndexState(document, demand)
  let currentDemand = normalizeDemand(demand)

  return {
    state: () => current,
    sync: (nextDocument, delta, demandForSync) => {
      const previous = current
      const nextDemand = demandForSync
        ? normalizeDemand(demandForSync)
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
      const group = sameList(currentDemand.groupFields, nextDemand.groupFields)
        ? ensureGroupIndex(
            syncGroupIndex(previous.group, nextDocument, records, delta),
            nextDocument,
            records,
            nextDemand.groupFields
          )
        : buildGroupIndex(nextDocument, records, nextDemand.groupFields, previous.group.rev + 1)
      const groupMs = now() - groupStart

      const sortStart = now()
      const sort = sameList(currentDemand.sortFields, nextDemand.sortFields)
        ? ensureSortIndex(
            syncSortIndex(previous.sort, nextDocument, records, delta),
            nextDocument,
            records,
            nextDemand.sortFields
          )
        : buildSortIndex(nextDocument, records, nextDemand.sortFields, previous.sort.rev + 1)
      const sortMs = now() - sortStart

      const calculationsStart = now()
      const calculations = sameList(currentDemand.calculationFields, nextDemand.calculationFields)
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
            inputSize: previous.search.records.size,
            outputSize: search.records.size,
            touchedRecordCount,
            touchedFieldCount
          }),
          group: createIndexStageTrace({
            previous: previous.group,
            next: group,
            rebuild,
            durationMs: groupMs,
            inputSize: previous.group.fields.size,
            outputSize: group.fields.size,
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
