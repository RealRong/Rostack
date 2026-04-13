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
  demand: NormalizedIndexDemand
): IndexState => {
  const records = buildRecordIndex(document, demand.recordFields)

  return {
    records,
    search: buildSearchIndex(document, records, demand.search),
    group: buildGroupIndex(document, records, demand.groups),
    sort: buildSortIndex(document, records, demand.sortFields),
    calculations: buildCalculationIndex(document, records, demand.calculationFields)
  }
}

const runIndexDemandStage = <
  TState extends { rev: number },
  TDemand
>(input: {
  previous: TState
  previousDemand: TDemand
  nextDemand: TDemand
  sameDemand: (left: TDemand, right: TDemand) => boolean
  sync: (previous: TState) => TState
  ensure: (state: TState) => TState
  build: (rev: number) => TState
}): {
  state: TState
  durationMs: number
} => {
  const start = now()
  const state = input.sameDemand(input.previousDemand, input.nextDemand)
    ? input.ensure(input.sync(input.previous))
    : input.build(input.previous.rev + 1)

  return {
    state,
    durationMs: now() - start
  }
}

export const createIndexState = (
  document: DataDoc,
  demand?: IndexDemand
): IndexDeriveResult => {
  const normalized = normalizeIndexDemand(demand)
  return {
    state: buildState(document, normalized),
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

  const searchStage = runIndexDemandStage({
    previous: previous.search,
    previousDemand: input.previousDemand.search,
    nextDemand: nextDemand.search,
    sameDemand: sameSearchDemand,
    sync: current => syncSearchIndex(current, input.document, records, input.delta),
    ensure: current => ensureSearchIndex(current, input.document, records, nextDemand.search),
    build: rev => buildSearchIndex(input.document, records, nextDemand.search, rev)
  })

  const groupStage = runIndexDemandStage({
    previous: previous.group,
    previousDemand: input.previousDemand.groups,
    nextDemand: nextDemand.groups,
    sameDemand: sameGroupDemand,
    sync: current => syncGroupIndex(current, input.document, records, input.delta),
    ensure: current => ensureGroupIndex(current, input.document, records, nextDemand.groups),
    build: rev => buildGroupIndex(input.document, records, nextDemand.groups, rev)
  })

  const sortStage = runIndexDemandStage({
    previous: previous.sort,
    previousDemand: input.previousDemand.sortFields,
    nextDemand: nextDemand.sortFields,
    sameDemand: sameFieldIdList,
    sync: current => syncSortIndex(current, input.document, records, input.delta),
    ensure: current => ensureSortIndex(current, input.document, records, nextDemand.sortFields),
    build: rev => buildSortIndex(input.document, records, nextDemand.sortFields, rev)
  })

  const summariesStage = runIndexDemandStage({
    previous: previous.calculations,
    previousDemand: input.previousDemand.calculationFields,
    nextDemand: nextDemand.calculationFields,
    sameDemand: sameFieldIdList,
    sync: current => syncCalculationIndex(current, input.document, records, input.delta),
    ensure: current => ensureCalculationIndex(current, input.document, records, nextDemand.calculationFields),
    build: rev => buildCalculationIndex(input.document, records, nextDemand.calculationFields, rev)
  })

  const search = searchStage.state
  const group = groupStage.state
  const sort = sortStage.state
  const summaries = summariesStage.state
  const searchMs = searchStage.durationMs
  const groupMs = groupStage.durationMs
  const sortMs = sortStage.durationMs
  const summariesMs = summariesStage.durationMs

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
