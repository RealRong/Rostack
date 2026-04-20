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
} from '@dataview/engine/active/index/demand'
import {
  buildBucketIndex,
  ensureBucketIndex,
  syncBucketIndex,
  createBucketSpecKey
} from '@dataview/engine/active/index/bucket'
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
  deriveSortIndex
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
  ensureBucketChange
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
    bucket: buildBucketIndex(context, records, demand.buckets),
    sort: buildSortIndex(context, records, demand.sortFields),
    calculations: buildCalculationIndex(context, records, demand.calculations)
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

  const bucketStart = now()
  const syncedBucket = syncBucketIndex(
    previous.bucket,
    context,
    records,
    input.impact
  )
  const bucket = ensureBucketIndex(
    syncedBucket,
    context,
    records,
    nextDemand.buckets
  )
  const bucketMs = now() - bucketStart

  const previousSectionBucketKey = input.previousDemand.buckets.find(spec => spec.mode !== undefined || spec.interval !== undefined)
    ? createBucketSpecKey(input.previousDemand.buckets.find(spec => spec.mode !== undefined || spec.interval !== undefined)!)
    : undefined
  const nextSectionBucketKey = nextDemand.buckets.find(spec => spec.mode !== undefined || spec.interval !== undefined)
    ? createBucketSpecKey(nextDemand.buckets.find(spec => spec.mode !== undefined || spec.interval !== undefined)!)
    : undefined
  if (
    nextSectionBucketKey
    && previousSectionBucketKey !== nextSectionBucketKey
  ) {
    ensureBucketChange(input.impact).rebuild = true
  }

  const sortStart = now()
  const sort = deriveSortIndex({
    previous: previous.sort,
    context,
    records,
    fieldIds: nextDemand.sortFields
  })
  const sortMs = now() - sortStart

  const summariesStart = now()
  const syncedSummaries = syncCalculationIndex(
    previous.calculations,
    context,
    records,
    input.impact
  )
  const summaries = ensureCalculationIndex(
    syncedSummaries,
    context,
    records,
    nextDemand.calculations
  )
  const summariesMs = now() - summariesStart

  const state = {
    records,
    search,
    bucket,
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
        || bucket !== previous.bucket
        || sort !== previous.sort
        || summaries !== previous.calculations
      ),
      timings: {
        totalMs: now() - totalStart,
        recordsMs,
        searchMs,
        bucketMs,
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
      bucket: createIndexStageTrace({
        previous: previous.bucket,
        next: bucket,
        rebuild,
        durationMs: bucketMs,
        inputSize: previous.bucket.fields.size,
        outputSize: bucket.fields.size,
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
