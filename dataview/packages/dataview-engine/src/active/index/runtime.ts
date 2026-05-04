import type {
  DataDoc,
  RecordId
} from '@dataview/core/types'
import type {
  DataviewMutationChange,
  DataviewQuery
} from '@dataview/core/mutation'
import type {
  DataviewFrame,
  DataviewResolvedContext
} from '@dataview/engine/active/frame'
import {
  createDataviewResolvedContext,
} from '@dataview/engine/active/frame'
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
import type {
  BucketKey,
  ContentDelta,
  IndexDeriveContext,
  IndexDeriveResult,
  IndexReadContext,
  IndexState,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  createCalculationTransition,
  createMembershipTransition
} from '@dataview/engine/active/shared/transition'
import {
  createRows
} from '@dataview/engine/active/shared/rows'

export interface DataviewActiveIndex {
  demand: NormalizedIndexDemand
  state: IndexState
  revision: number
  delta?: import('@dataview/engine/active/index/contracts').IndexDelta
}

export interface DataviewIndexResult {
  action: 'reuse' | 'sync' | 'rebuild'
  index: DataviewActiveIndex
}

const createIndexReadContext = (
  document: DataDoc
): IndexReadContext => {
  const context: DataviewResolvedContext = createDataviewResolvedContext(document)

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
  query: DataviewQuery,
  change: DataviewMutationChange
): ContentDelta => {
  if (change.reset()) {
    return {
      records: 'all',
      values: 'all',
      schema: new Set(query.fields.ids()),
      touchedFields: 'all',
      recordSetChanged: true,
      reset: true
    }
  }

  const schemaTouched = change.field.schemaTouchedIds()

  return {
    records: change.record.touchedIds(),
    values: change.record.values.touchedFieldIds(),
    schema: schemaTouched === 'all'
      ? new Set(query.fields.ids())
      : schemaTouched,
    touchedFields: change.field.touchedIds(),
    recordSetChanged: change.record.setChanged(),
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
  query: DataviewQuery
  change: DataviewMutationChange
  demand?: NormalizedIndexDemand
}): IndexDeriveResult => {
  const previous = input.previous
  const nextDemand = input.demand ?? input.previousDemand
  const demandDelta = diffNormalizedIndexDemand(input.previousDemand, nextDemand)
  const contentDelta = createContentDelta(
    input.query,
    input.change
  )
  const context = createIndexDeriveContext(input.document, contentDelta)
  const bucketDelta = createMembershipTransition<BucketKey, RecordId>()
  const calculationDelta = createCalculationTransition()

  const records = syncRecordIndex(
    previous.records,
    context,
    nextDemand.recordFields
  )

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

  const sort = deriveSortIndex({
    previous: previous.sort,
    context,
    records,
    fieldIds: nextDemand.sortFields
  })

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
      : {})
  }
}

const createActiveIndex = (input: {
  revision: number
  demand: NormalizedIndexDemand
  state: IndexState
  delta?: import('@dataview/engine/active/index/contracts').IndexDelta
}): DataviewActiveIndex => ({
  demand: input.demand,
  state: input.state,
  revision: input.revision,
  ...(input.delta
    ? {
      delta: input.delta
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
  const contentDelta = createContentDelta(
    input.frame.query,
    input.frame.change
  )
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
      query: input.frame.query,
      change: input.frame.change,
      demand: active.demand
    })
    const index = createActiveIndex({
      revision: input.frame.revision,
      demand: active.demand,
      state: next.state,
      delta: next.delta
    })
    const changed = (
      next.state.records !== previous.state.records
      || next.state.search !== previous.state.search
      || next.state.bucket !== previous.state.bucket
      || next.state.sort !== previous.state.sort
      || next.state.calculations !== previous.state.calculations
      || next.state.rows !== previous.state.rows
    )

    return {
      action: input.frame.change.reset()
        ? 'rebuild'
        : changed
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
