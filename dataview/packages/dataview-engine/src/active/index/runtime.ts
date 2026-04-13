import type {
  CommitDelta,
  DataDoc
} from '@dataview/core/contracts'
import type {
  IndexTrace
} from '#engine/contracts/public.ts'
import {
  buildCalculationIndex,
  ensureCalculationIndex,
  syncCalculationIndex
} from '#engine/active/index/calculations.ts'
import {
  normalizeIndexDemand,
  sameFieldIdList,
  sameGroupDemand,
  sameSearchDemand
} from '#engine/active/index/demand.ts'
import {
  buildGroupIndex,
  ensureGroupIndex,
  syncGroupIndex
} from '#engine/active/index/group/runtime.ts'
import {
  buildRecordIndex,
  syncRecordIndex
} from '#engine/active/index/records.ts'
import {
  buildSearchIndex,
  ensureSearchIndex,
  syncSearchIndex
} from '#engine/active/index/search.ts'
import {
  buildSortIndex,
  ensureSortIndex,
  syncSortIndex
} from '#engine/active/index/sort.ts'
import {
  createIndexStageTrace,
  fullRebuildFrom,
  searchEntryCountOf,
  touchedFieldCountOf,
  touchedRecordCountOf
} from '#engine/active/index/trace.ts'
import type {
  IndexDemand,
  IndexDeriveResult,
  IndexState,
  NormalizedIndexDemand
} from '#engine/active/index/contracts.ts'
import {
  now
} from '#engine/runtime/clock.ts'

const buildState = (
  document: DataDoc,
  demand?: IndexDemand
): IndexState => {
  const normalized = normalizeIndexDemand(demand)
  const records = buildRecordIndex(document, normalized.recordFields)

  return {
    records,
    search: buildSearchIndex(document, records, normalized.search),
    group: buildGroupIndex(document, records, normalized.groups),
    sort: buildSortIndex(document, records, normalized.sortFields),
    calculations: buildCalculationIndex(document, records, normalized.calculationFields)
  }
}

export const createIndexState = (
  document: DataDoc,
  demand?: IndexDemand
): IndexDeriveResult => {
  const normalized = normalizeIndexDemand(demand)
  return {
    state: buildState(document, demand),
    demand: normalized
  }
}

export const deriveIndex = (input: {
  previous: IndexState
  previousDemand: NormalizedIndexDemand
  document: DataDoc
  delta: CommitDelta
  demand?: IndexDemand
}): IndexDeriveResult => {
  const previous = input.previous
  const nextDemand = input.demand
    ? normalizeIndexDemand(input.demand)
    : input.previousDemand
  const totalStart = now()
  const touchedRecordCount = touchedRecordCountOf(input.delta)
  const touchedFieldCount = touchedFieldCountOf(input.delta)
  const rebuild = fullRebuildFrom(input.delta)

  const recordsStart = now()
  const records = syncRecordIndex(
    previous.records,
    input.document,
    input.delta,
    nextDemand.recordFields
  )
  const recordsMs = now() - recordsStart

  const searchStart = now()
  const search = sameSearchDemand(input.previousDemand.search, nextDemand.search)
    ? ensureSearchIndex(
        syncSearchIndex(previous.search, input.document, records, input.delta),
        input.document,
        records,
        nextDemand.search
      )
    : buildSearchIndex(input.document, records, nextDemand.search, previous.search.rev + 1)
  const searchMs = now() - searchStart

  const groupStart = now()
  const group = sameGroupDemand(input.previousDemand.groups, nextDemand.groups)
    ? ensureGroupIndex(
        syncGroupIndex(previous.group, input.document, records, input.delta),
        input.document,
        records,
        nextDemand.groups
      )
    : buildGroupIndex(input.document, records, nextDemand.groups, previous.group.rev + 1)
  const groupMs = now() - groupStart

  const sortStart = now()
  const sort = sameFieldIdList(input.previousDemand.sortFields, nextDemand.sortFields)
    ? ensureSortIndex(
        syncSortIndex(previous.sort, input.document, records, input.delta),
        input.document,
        records,
        nextDemand.sortFields
      )
    : buildSortIndex(input.document, records, nextDemand.sortFields, previous.sort.rev + 1)
  const sortMs = now() - sortStart

  const summariesStart = now()
  const summaries = sameFieldIdList(input.previousDemand.calculationFields, nextDemand.calculationFields)
    ? ensureCalculationIndex(
        syncCalculationIndex(previous.calculations, input.document, records, input.delta),
        input.document,
        records,
        nextDemand.calculationFields
      )
    : buildCalculationIndex(
        input.document,
        records,
        nextDemand.calculationFields,
        previous.calculations.rev + 1
      )
  const summariesMs = now() - summariesStart

  const state = {
    records,
    search,
    group,
    sort,
    calculations: summaries
  } satisfies IndexState

  return {
    state,
    demand: nextDemand,
    trace: {
      changed: (
        records !== previous.records
        || search !== previous.search
        || group !== previous.group
        || sort !== previous.sort
        || summaries !== previous.calculations
      ),
      timings: {
        totalMs: now() - totalStart,
        recordsMs,
        searchMs,
        groupMs,
        sortMs,
        summariesMs
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
      summaries: createIndexStageTrace({
        previous: previous.calculations,
        next: summaries,
        rebuild,
        durationMs: summariesMs,
        inputSize: previous.calculations.fields.size,
        outputSize: summaries.fields.size,
        touchedRecordCount,
        touchedFieldCount
      })
    }
  }
}
