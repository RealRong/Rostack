import type {
  DataDoc,
  RecordId
} from '@dataview/core/types'
import type {
  DataviewDeltaQuery,
  DataviewMutationDelta,
  DataviewQuery
} from '@dataview/core/mutation'
import {
  createDataviewQueryContext
} from '@dataview/core/mutation'
import type {
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  IndexTrace
} from '@dataview/engine/contracts/performance'
import {
  buildCalculationIndex,
  ensureCalculationIndex,
  syncCalculationIndex
} from '@dataview/engine/active/index/calculations'
import {
  diffNormalizedIndexDemand,
  indexDemandDeltaChanged,
  emptyNormalizedIndexDemand
} from '@dataview/engine/active/index/demand'
import {
  writeNormalizedIndexDemandKey
} from '@dataview/engine/active/index/demand'
import {
  buildBucketIndex,
  bucket as bucketSpec,
  ensureBucketIndex,
  syncBucketIndex
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
  searchEntryCountOf
} from '@dataview/engine/active/index/trace'
import type {
  BucketKey,
  ContentDelta,
  IndexDeriveContext,
  IndexDeriveResult,
  IndexReadContext,
  IndexState,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import { now } from '@dataview/engine/runtime/clock'
import {
  createCalculationTransition,
  createMembershipTransition
} from '@dataview/engine/active/shared/transition'
import {
  createRows
} from '@dataview/engine/active/shared/rows'
import {
  trace
} from '@shared/trace'

export interface DataviewActiveIndex {
  demand: NormalizedIndexDemand
  state: IndexState
  revision: number
  delta?: import('@dataview/engine/active/index/contracts').IndexDelta
  trace?: IndexTrace
}

export interface DataviewIndexResult {
  action: 'reuse' | 'sync' | 'rebuild'
  index: DataviewActiveIndex
}

const createIndexReadContext = (
  document: DataDoc
): IndexReadContext => {
  const context = createDataviewQueryContext(document)

  return {
    document: context.document,
    reader: context.query,
    fieldIds: context.fieldIds,
    fieldIdSet: context.fieldIdSet
  }
}

const createIndexDeriveContext = (
  document: DataDoc,
  content: ContentDelta
): IndexDeriveContext => {
  return {
    ...createIndexReadContext(document),
    schemaFields: content.schema,
    valueFields: content.values,
    touchedFields: content.touchedFields,
    touchedRecords: content.records,
    recordSetChanged: content.recordSetChanged,
    changed: Boolean(
      content.reset
      || content.recordSetChanged
      || content.records === 'all'
      || (content.records instanceof Set && content.records.size > 0)
      || content.touchedFields === 'all'
      || (content.touchedFields instanceof Set && content.touchedFields.size > 0)
      || content.schema.size > 0
    )
  }
}

const createContentDelta = (
  document: DataDoc,
  query: DataviewQuery,
  delta: DataviewMutationDelta
): ContentDelta => {
  const changes = query.changes(delta)
  if (delta.reset === true) {
    return {
      records: 'all',
      values: 'all',
      schema: new Set(query.fields.ids()),
      touchedFields: 'all',
      recordSetChanged: true,
      reset: true
    }
  }

  const schemaTouched = changes.fieldSchemaTouchedIds()

  return {
    records: changes.touchedRecords(),
    values: changes.touchedValueFields(),
    schema: schemaTouched === 'all'
      ? new Set(query.fields.ids())
      : schemaTouched,
    touchedFields: changes.touchedFields(),
    recordSetChanged: changes.recordSetChanged(),
    reset: false
  }
}

const contentDeltaChanged = (
  delta: ContentDelta
): boolean => (
  delta.reset
  || delta.recordSetChanged
  || delta.records === 'all'
  || delta.values === 'all'
  || delta.touchedFields === 'all'
  || (delta.records instanceof Set && delta.records.size > 0)
  || (delta.values instanceof Set && delta.values.size > 0)
  || (delta.touchedFields instanceof Set && delta.touchedFields.size > 0)
  || delta.schema.size > 0
)

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
  delta: DataviewMutationDelta
  demand?: NormalizedIndexDemand
}): IndexDeriveResult => {
  const previous = input.previous
  const nextDemand = input.demand ?? input.previousDemand
  const demandDelta = diffNormalizedIndexDemand(input.previousDemand, nextDemand)
  const contentDelta = createContentDelta(
    input.document,
    createDataviewQueryContext(input.document).query,
    input.delta
  )
  const context = createIndexDeriveContext(input.document, contentDelta)
  const totalStart = now()
  const touchedRecordCount = trace.count(contentDelta.records as ReadonlySet<RecordId> | 'all')
  const touchedFieldCount = trace.count(contentDelta.touchedFields as ReadonlySet<string> | 'all')
  const rebuild = fullRebuildFrom(input.delta)
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
    ? bucketSpec.key.write(input.previousDemand.buckets.find(spec => spec.mode !== undefined || spec.interval !== undefined)!)
    : undefined
  const nextSectionBucketKey = nextDemand.buckets.find(spec => spec.mode !== undefined || spec.interval !== undefined)
    ? bucketSpec.key.write(nextDemand.buckets.find(spec => spec.mode !== undefined || spec.interval !== undefined)!)
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

  const hasDemandDelta = indexDemandDeltaChanged(demandDelta)
  const hasContentDelta = contentDeltaChanged(contentDelta)
  const delta = (
    bucketDelta.rebuild
    || bucketDelta.records.size
    || calculationDelta.fields.size
    || hasDemandDelta
    || hasContentDelta
  )
    ? {
        ...(bucketDelta.rebuild || bucketDelta.records.size
          ? { bucket: bucketDelta }
          : {}),
        ...(calculationDelta.fields.size
          ? { calculation: calculationDelta }
          : {}),
        ...(hasDemandDelta
          ? { demand: demandDelta }
          : {}),
        ...(hasContentDelta
          ? { content: contentDelta }
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

const createActiveIndex = (input: {
  revision: number
  demand: NormalizedIndexDemand
  state: IndexState
  delta?: import('@dataview/engine/active/index/contracts').IndexDelta
  trace?: IndexTrace
}): DataviewActiveIndex => ({
  demand: input.demand,
  state: input.state,
  revision: input.revision,
  ...(input.delta
    ? {
        delta: input.delta
      }
    : {}),
  ...(input.trace
    ? {
        trace: input.trace
      }
    : {})
})

export const ensureDataviewIndex = (input: {
  frame: DataviewFrame
  previous?: DataviewActiveIndex
}): DataviewIndexResult | undefined => {
  const active = input.frame.active
  if (!active) {
    return undefined
  }

  const document = input.frame.context.document
  const contentDelta = createContentDelta(document, input.frame.query, input.frame.delta)
  const previous = input.previous

  if (
    previous
    && writeNormalizedIndexDemandKey(previous.demand) === writeNormalizedIndexDemandKey(active.demand)
    && !contentDeltaChanged(contentDelta)
  ) {
    return {
      action: 'reuse',
      index: previous
    }
  }

  if (previous) {
    const next = deriveIndex({
      previous: previous.state,
      previousDemand: previous.demand,
      document,
      delta: input.frame.delta,
      demand: active.demand
    })
    const index = createActiveIndex({
      revision: input.frame.revision,
      demand: active.demand,
      state: next.state,
      delta: next.delta,
      trace: next.trace
    })

    return {
      action: input.frame.delta.reset === true
        ? 'rebuild'
        : next.trace?.changed
          ? 'sync'
          : 'reuse',
      index
    }
  }

  const nextState = createIndexState(document, active.demand)
  const index = createActiveIndex({
    revision: input.frame.revision,
    demand: active.demand,
    state: nextState
  })

  return {
    action: 'rebuild',
    index
  }
}
