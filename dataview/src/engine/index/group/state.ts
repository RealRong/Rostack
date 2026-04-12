import type {
  CommitDelta,
  DataDoc,
  RecordId
} from '@dataview/core/contracts'
import {
  hasDocumentField,
  getDocumentFieldById
} from '@dataview/core/document'
import {
  insertOrderedId,
  removeOrderedId
} from '../shared'
import {
  createFieldSyncContext,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '../runtime/sync'
import type {
  BucketKey,
  GroupDemand,
  GroupFieldIndex,
  GroupIndex,
  RecordIndex,
  SortedIdSet
} from '../types'
import {
  buildBucketState,
  resolveBucketKeys,
  sameBucketKeys
} from './bucket'
import {
  createGroupDemandKey
} from './demand'

const buildGroupFieldIndex = (
  document: DataDoc,
  records: RecordIndex,
  demand: GroupDemand,
  previous?: GroupFieldIndex
): GroupFieldIndex => {
  const field = getDocumentFieldById(document, demand.fieldId)
  const recordBuckets = new Map<RecordId, readonly BucketKey[]>()
  const bucketRecords = new Map<BucketKey, RecordId[]>()
  const values = records.values.get(demand.fieldId)

  if (field) {
    records.ids.forEach(recordId => {
      const buckets = resolveBucketKeys(field, values?.get(recordId), demand)
      recordBuckets.set(recordId, buckets)
      buckets.forEach(bucketKey => {
        const ids = bucketRecords.get(bucketKey) ?? []
        if (!bucketRecords.has(bucketKey)) {
          bucketRecords.set(bucketKey, ids)
        }
        ids.push(recordId)
      })
    })
  }

  const bucketState = buildBucketState({
    document,
    records,
    demand,
    bucketRecords,
    previous
  })

  return {
    fieldId: demand.fieldId,
    mode: demand.mode,
    bucketSort: demand.bucketSort,
    bucketInterval: demand.bucketInterval,
    recordBuckets,
    bucketRecords,
    buckets: bucketState.buckets,
    order: bucketState.order
  }
}

const removeBucketMemberships = (
  bucketRecords: Map<BucketKey, SortedIdSet<RecordId>>,
  bucketKeys: readonly BucketKey[],
  recordId: RecordId
) => {
  bucketKeys.forEach(bucketKey => {
    const ids = bucketRecords.get(bucketKey)
    if (!ids) {
      return
    }

    const nextIds = removeOrderedId(ids, recordId)
    if (nextIds.length) {
      bucketRecords.set(bucketKey, nextIds)
      return
    }

    bucketRecords.delete(bucketKey)
  })
}

const addBucketMemberships = (
  bucketRecords: Map<BucketKey, SortedIdSet<RecordId>>,
  bucketKeys: readonly BucketKey[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
) => {
  bucketKeys.forEach(bucketKey => {
    bucketRecords.set(
      bucketKey,
      insertOrderedId(bucketRecords.get(bucketKey) ?? [], recordId, order)
    )
  })
}

const syncGroupFieldIndex = (input: {
  previous: GroupFieldIndex
  document: DataDoc
  records: RecordIndex
  touchedRecords: ReadonlySet<RecordId>
}): GroupFieldIndex => {
  const demand: GroupDemand = {
    fieldId: input.previous.fieldId,
    mode: input.previous.mode,
    bucketSort: input.previous.bucketSort,
    bucketInterval: input.previous.bucketInterval
  }
  const field = getDocumentFieldById(input.document, demand.fieldId)
  if (!field) {
    return buildGroupFieldIndex(input.document, input.records, demand)
  }

  const nextRecordBuckets = new Map(input.previous.recordBuckets)
  const nextBucketRecords = new Map(input.previous.bucketRecords)
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const before = input.previous.recordBuckets.get(recordId) ?? []
    const nextValue = input.records.order.has(recordId)
      ? input.records.values.get(demand.fieldId)?.get(recordId)
      : undefined
    const after = input.records.order.has(recordId)
      ? resolveBucketKeys(field, nextValue, demand)
      : []

    if (sameBucketKeys(before, after)) {
      return
    }

    if (before.length) {
      removeBucketMemberships(nextBucketRecords, before, recordId)
      nextRecordBuckets.delete(recordId)
    }

    if (after.length) {
      nextRecordBuckets.set(recordId, after)
      addBucketMemberships(nextBucketRecords, after, recordId, input.records.order)
    }

    changed = true
  })

  if (!changed) {
    return input.previous
  }

  const bucketState = buildBucketState({
    document: input.document,
    records: input.records,
    demand,
    bucketRecords: nextBucketRecords,
    previous: input.previous
  })

  return {
    fieldId: demand.fieldId,
    mode: demand.mode,
    bucketSort: demand.bucketSort,
    bucketInterval: demand.bucketInterval,
    recordBuckets: nextRecordBuckets,
    bucketRecords: nextBucketRecords,
    buckets: bucketState.buckets,
    order: bucketState.order
  }
}

export const buildGroupIndex = (
  document: DataDoc,
  records: RecordIndex,
  groups: readonly GroupDemand[] = [],
  rev = 1
): GroupIndex => {
  const base: GroupIndex = {
    groups: new Map(),
    rev
  }
  const built = ensureGroupIndex(base, document, records, groups)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureGroupIndex = (
  previous: GroupIndex,
  document: DataDoc,
  records: RecordIndex,
  groups: readonly GroupDemand[] = []
): GroupIndex => {
  let changed = false
  const nextGroups = new Map(previous.groups)

  groups.forEach(demand => {
    const key = createGroupDemandKey(demand)
    if (nextGroups.has(key) || !hasDocumentField(document, demand.fieldId)) {
      return
    }

    nextGroups.set(key, buildGroupFieldIndex(document, records, demand))
    changed = true
  })

  return changed
    ? {
        groups: nextGroups,
        rev: previous.rev + 1
      }
    : previous
}

export const syncGroupIndex = (
  previous: GroupIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): GroupIndex => {
  if (!delta.summary.indexes || !previous.groups.size) {
    return previous
  }

  const context = createFieldSyncContext(delta, {
    includeTitlePatch: true
  })
  let changed = false
  const nextGroups = new Map(previous.groups)

  Array.from(previous.groups.entries()).forEach(([key, groupIndex]) => {
    const fieldId = groupIndex.fieldId
    if (shouldDropFieldIndex(document, context, fieldId)) {
      nextGroups.delete(key)
      changed = true
      return
    }

    const demand: GroupDemand = {
      fieldId: groupIndex.fieldId,
      mode: groupIndex.mode,
      bucketSort: groupIndex.bucketSort,
      bucketInterval: groupIndex.bucketInterval
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      nextGroups.set(key, buildGroupFieldIndex(document, records, demand, groupIndex))
      changed = true
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const nextGroup = syncGroupFieldIndex({
      previous: groupIndex,
      document,
      records,
      touchedRecords: context.touchedRecords
    })
    if (nextGroup !== groupIndex) {
      nextGroups.set(key, nextGroup)
      changed = true
    }
  })

  return changed
    ? {
        groups: nextGroups,
        rev: previous.rev + 1
      }
    : previous
}
