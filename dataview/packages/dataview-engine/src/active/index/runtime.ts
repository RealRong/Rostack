import type {
  DataDoc,
  RecordId
} from '@dataview/core/contracts'
import type {
  IndexTrace
} from '@dataview/engine/contracts/performance'
import {
  buildCalculationIndex,
  ensureCalculationIndex,
  syncCalculationIndex
} from '@dataview/engine/active/index/calculations'
import {
  emptyNormalizedIndexDemand
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
  BucketKey,
  IndexDeriveContext,
  IndexDeriveResult,
  IndexReadContext,
  IndexState,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  now
} from '@dataview/engine/runtime/clock'
import {
  createDocumentReadContext
} from '@dataview/engine/document/reader'
import type {
  BaseImpact
} from '@dataview/engine/active/projection/impact'
import {
  createCalculationTransition,
  createMembershipTransition
} from '@dataview/engine/active/shared/transition'
import {
  createRows
} from '@dataview/engine/active/shared/rows'

const createIndexReadContext = (
  document: DataDoc
): IndexReadContext => {
  const context = createDocumentReadContext(document)

  return {
    document: context.document,
    reader: context.reader,
    fieldIds: context.fieldIds,
    fieldIdSet: context.fieldIdSet
  }
}

const createIndexDeriveContext = (
  document: DataDoc,
  impact: BaseImpact
): IndexDeriveContext => ({
  ...createIndexReadContext(document),
  schemaFields: impact.schemaFields,
  valueFields: impact.valueFields,
  touchedFields: impact.touchedFields,
  touchedRecords: impact.touchedRecords,
  recordSetChanged: impact.recordSetChanged,
  changed: Boolean(
    impact.trace.reset
    || impact.trace.records
    || impact.trace.fields?.schema
  )
})

const buildState = (
  document: DataDoc,
  demand: NormalizedIndexDemand
): IndexState => {
  const context = createIndexReadContext(document)
  const records = buildRecordIndex(context, demand.recordFields)
  const search = buildSearchIndex(context, records, demand.search)
  const bucket = buildBucketIndex(context, records, demand.buckets)
  const sort = buildSortIndex(context, records, demand.sortFields)
  const calculations = buildCalculationIndex(context, records, demand.calculations)

  return {
    records,
    search,
    bucket,
    sort,
    calculations,
    rows: createRows({
      records,
      search,
      bucket,
      calculations
    })
  }
}

export const createIndexState = (
  document: DataDoc,
  demand: NormalizedIndexDemand = emptyNormalizedIndexDemand()
): IndexState => buildState(document, demand)

export const deriveIndex = (input: {
  previous: IndexState
  previousDemand: NormalizedIndexDemand
  document: DataDoc
  impact: BaseImpact
  demand?: NormalizedIndexDemand
}): IndexDeriveResult => {
  const previous = input.previous
  const context = createIndexDeriveContext(input.document, input.impact)
  const nextDemand = input.demand ?? input.previousDemand
  const totalStart = now()
  const touchedRecordCount = touchedRecordCountOfImpact(input.impact)
  const touchedFieldCount = touchedFieldCountOfImpact(input.impact)
  const rebuild = fullRebuildFrom(input.impact)
  const bucketDelta = createMembershipTransition<BucketKey, RecordId>()
  const calculationDelta = createCalculationTransition()

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
    bucketDelta
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
    bucketDelta.rebuild = true
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
    previous.records,
    context,
    records,
    calculationDelta
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
    calculations: summaries,
    rows: createRows({
      previous: previous.rows,
      records,
      search,
      bucket,
      calculations: summaries
    })
  } satisfies IndexState

  const delta = (
    bucketDelta.rebuild
    || bucketDelta.records.size
    || calculationDelta.fields.size
  )
    ? {
        ...(bucketDelta.rebuild || bucketDelta.records.size
          ? { bucket: bucketDelta }
          : {}),
        ...(calculationDelta.fields.size
          ? { calculation: calculationDelta }
          : {})
      }
    : undefined

  return {
    state,
    ...(delta
      ? {
          delta
        }
      : {}),
    trace: {
      changed: (
        records !== previous.records
        || search !== previous.search
        || bucket !== previous.bucket
        || sort !== previous.sort
        || summaries !== previous.calculations
        || state.rows !== previous.rows
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
