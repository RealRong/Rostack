import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  IndexTrace
} from '@dataview/engine/contracts/public'
import {
  buildCalculationIndex,
  ensureCalculationIndex,
  syncCalculationIndex
} from '@dataview/engine/active/index/calculations'
import {
  createIndexDeriveContext,
  createIndexReadContext
} from '@dataview/engine/active/index/context'
import {
  normalizeIndexDemand,
  sameFieldIdList,
  sameCalculationDemand,
  sameGroupDemand
} from '@dataview/engine/active/index/demand'
import {
  buildGroupIndex,
  ensureGroupIndex,
  syncGroupIndex
} from '@dataview/engine/active/index/group/runtime'
import {
  createGroupDemandKey,
  readSectionGroupDemand
} from '@dataview/engine/active/index/group/demand'
import {
  buildRecordIndex,
  syncRecordIndex
} from '@dataview/engine/active/index/records'
import {
  buildSearchIndex,
  ensureSearchIndex,
  syncSearchIndex
} from '@dataview/engine/active/index/search'
import {
  buildSortIndex,
  ensureSortIndex,
  syncSortIndex
} from '@dataview/engine/active/index/sort'
import {
  createIndexStageTrace,
  fullRebuildFrom,
  searchEntryCountOf,
  touchedFieldCountOfImpact,
  touchedRecordCountOfImpact
} from '@dataview/engine/active/index/trace'
import type {
  IndexDemand,
  IndexDeriveResult,
  IndexState,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  now
} from '@dataview/engine/runtime/clock'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import {
  ensureGroupChange
} from '@dataview/engine/active/shared/impact'

const buildState = (
  document: DataDoc,
  demand: NormalizedIndexDemand
): IndexState => {
  const context = createIndexReadContext(document)
  const records = buildRecordIndex(context, demand.recordFields)

  return {
    records,
    search: buildSearchIndex(context, records, demand.search),
    group: buildGroupIndex(context, records, demand.groups),
    sort: buildSortIndex(context, records, demand.sortFields),
    calculations: buildCalculationIndex(context, records, demand.calculations)
  }
}

const runIndexDemandStage = <
  TState,
  TDemand
>(input: {
  previous: TState
  previousDemand: TDemand
  nextDemand: TDemand
  sameDemand: (left: TDemand, right: TDemand) => boolean
  sync: (previous: TState) => TState
  ensure: (state: TState) => TState
  build: (previous: TState) => TState
}): {
  state: TState
  durationMs: number
} => {
  const start = now()
  const state = input.sameDemand(input.previousDemand, input.nextDemand)
    ? input.ensure(input.sync(input.previous))
    : input.build(input.previous)

  return {
    state,
    durationMs: now() - start
  }
}

export const createIndexState = (
  document: DataDoc,
  demand?: IndexDemand
): IndexDeriveResult => {
  const context = createIndexReadContext(document)
  const normalized = normalizeIndexDemand(context, demand)
  return {
    state: buildState(document, normalized),
    demand: normalized
  }
}

export const deriveIndex = (input: {
  previous: IndexState
  previousDemand: NormalizedIndexDemand
  document: DataDoc
  impact: ActiveImpact
  demand?: IndexDemand
}): IndexDeriveResult => {
  const previous = input.previous
  const context = createIndexDeriveContext(input.document, input.impact)
  const nextDemand = input.demand
    ? normalizeIndexDemand(context, input.demand)
    : input.previousDemand
  const totalStart = now()
  const touchedRecordCount = touchedRecordCountOfImpact(input.impact)
  const touchedFieldCount = touchedFieldCountOfImpact(input.impact)
  const rebuild = fullRebuildFrom(input.impact)

  const recordsStart = now()
  const records = syncRecordIndex(
    previous.records,
    context,
    nextDemand.recordFields
  )
  const recordsMs = now() - recordsStart

  const searchStart = now()
  const syncedSearch = syncSearchIndex(
    previous.search,
    context,
    records
  )
  const search = ensureSearchIndex(
    syncedSearch,
    context,
    records,
    nextDemand.search
  )
  const searchMs = now() - searchStart

  const groupStage = runIndexDemandStage({
    previous: previous.group,
    previousDemand: input.previousDemand.groups,
    nextDemand: nextDemand.groups,
    sameDemand: sameGroupDemand,
    sync: current => syncGroupIndex(
      current,
      context,
      records,
      input.impact
    ),
    ensure: current => ensureGroupIndex(current, context, records, nextDemand.groups),
    build: current => buildGroupIndex(context, records, nextDemand.groups, current.rev + 1)
  })

  const previousSectionGroupKey = readSectionGroupDemand(input.previousDemand.groups)
    ? createGroupDemandKey(readSectionGroupDemand(input.previousDemand.groups)!)
    : undefined
  const nextSectionGroupKey = readSectionGroupDemand(nextDemand.groups)
    ? createGroupDemandKey(readSectionGroupDemand(nextDemand.groups)!)
    : undefined
  if (
    nextSectionGroupKey
    && previousSectionGroupKey !== nextSectionGroupKey
  ) {
    ensureGroupChange(input.impact).rebuild = true
  }

  const sortStage = runIndexDemandStage({
    previous: previous.sort,
    previousDemand: input.previousDemand.sortFields,
    nextDemand: nextDemand.sortFields,
    sameDemand: sameFieldIdList,
    sync: current => syncSortIndex(current, context, records),
    ensure: current => ensureSortIndex(current, context, records, nextDemand.sortFields),
    build: current => buildSortIndex(context, records, nextDemand.sortFields, current.rev + 1)
  })

  const summariesStage = runIndexDemandStage({
    previous: previous.calculations,
    previousDemand: input.previousDemand.calculations,
    nextDemand: nextDemand.calculations,
    sameDemand: sameCalculationDemand,
    sync: current => syncCalculationIndex(current, context, records, input.impact),
    ensure: current => ensureCalculationIndex(current, context, records, nextDemand.calculations),
    build: current => buildCalculationIndex(context, records, nextDemand.calculations, current.rev + 1)
  })

  const group = groupStage.state
  const sort = sortStage.state
  const summaries = summariesStage.state
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
