import {
  getRecordFieldValue
} from '@dataview/core/field'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  BucketKey,
  GroupDemand,
  GroupFieldIndex,
  GroupIndex,
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex
} from '@dataview/engine/active/index/contracts'
import type {
  ActiveImpact,
  MembershipChange
} from '@dataview/engine/active/shared/impact'
import {
  buildBucketState,
  resolveBucketKeys,
  sameBucketKeys
} from '@dataview/engine/active/index/group/bucket'
import {
  createGroupDemandKey
} from '@dataview/engine/active/index/group/demand'
import {
  applyOrderedIdDelta
} from '@dataview/engine/active/shared/ordered'
import {
  applyMembershipTransition,
  ensureGroupChange
} from '@dataview/engine/active/shared/impact'
import {
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'

const EMPTY_BUCKET_KEYS: readonly BucketKey[] = []
const EMPTY_RECORD_IDS: readonly RecordId[] = []

const addBucketRecord = <T extends string>(
  target: Map<T, RecordId[]>,
  key: T,
  recordId: RecordId
) => {
  const records = target.get(key)
  if (records) {
    records.push(recordId)
    return
  }

  target.set(key, [recordId])
}

const buildGroupFieldIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  demand: GroupDemand,
  previous?: GroupFieldIndex
): GroupFieldIndex => {
  const field = context.reader.fields.get(demand.fieldId)
  const recordBuckets = new Map<RecordId, readonly BucketKey[]>()
  const bucketRecords = new Map<BucketKey, RecordId[]>()

  if (field) {
    records.ids.forEach(recordId => {
      const row = records.byId[recordId]
      const buckets = resolveBucketKeys(
        field,
        row ? getRecordFieldValue(row, demand.fieldId) : undefined,
        demand
      )
      recordBuckets.set(recordId, buckets)
      buckets.forEach(bucketKey => {
        const ids = bucketRecords.get(bucketKey)
        if (ids) {
          ids.push(recordId)
          return
        }

        bucketRecords.set(bucketKey, [recordId])
      })
    })
  }

  const bucketState = buildBucketState({
    field,
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

const syncGroupFieldIndex = (input: {
  previous: GroupFieldIndex
  context: IndexDeriveContext
  records: RecordIndex
  touchedRecords: ReadonlySet<RecordId>
  groupChange?: MembershipChange<BucketKey, RecordId>
}): GroupFieldIndex => {
  const demand: GroupDemand = {
    fieldId: input.previous.fieldId,
    mode: input.previous.mode,
    bucketSort: input.previous.bucketSort,
    bucketInterval: input.previous.bucketInterval
  }
  const field = input.context.reader.fields.get(demand.fieldId)
  if (!field) {
    return buildGroupFieldIndex(input.context, input.records, demand)
  }

  const recordBuckets = createMapPatchBuilder(input.previous.recordBuckets)
  const touchedBuckets = new Set<BucketKey>()
  const removedByBucket = new Map<BucketKey, RecordId[]>()
  const addedByBucket = new Map<BucketKey, RecordId[]>()
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const before = input.previous.recordBuckets.get(recordId) ?? EMPTY_BUCKET_KEYS
    const row = input.records.byId[recordId]
    const nextValue = input.records.order.has(recordId) && row
      ? getRecordFieldValue(row, demand.fieldId)
      : undefined
    const after = input.records.order.has(recordId)
      ? resolveBucketKeys(field, nextValue, demand)
      : EMPTY_BUCKET_KEYS

    if (sameBucketKeys(before, after)) {
      return
    }

    changed = true
    if (input.groupChange) {
      applyMembershipTransition(input.groupChange, recordId, before, after)
    }
    before.forEach(bucketKey => {
      touchedBuckets.add(bucketKey)
      if (!after.includes(bucketKey)) {
        addBucketRecord(removedByBucket, bucketKey, recordId)
      }
    })
    after.forEach(bucketKey => {
      touchedBuckets.add(bucketKey)
      if (!before.includes(bucketKey)) {
        addBucketRecord(addedByBucket, bucketKey, recordId)
      }
    })

    if (after.length) {
      recordBuckets.set(recordId, after)
      return
    }

    recordBuckets.delete(recordId)
  })

  if (!changed) {
    return input.previous
  }

  const nextRecordBuckets = recordBuckets.finish()
  const bucketRecords = createMapPatchBuilder(input.previous.bucketRecords)

  touchedBuckets.forEach(bucketKey => {
    const removed = removedByBucket.get(bucketKey)
    const ids = applyOrderedIdDelta({
      previous: input.previous.bucketRecords.get(bucketKey) ?? EMPTY_RECORD_IDS,
      remove: removed?.length
        ? new Set(removed)
        : undefined,
      add: addedByBucket.get(bucketKey),
      order: input.records.order
    })
    if (ids?.length) {
      bucketRecords.set(bucketKey, ids)
      return
    }

    bucketRecords.delete(bucketKey)
  })

  const nextBucketRecords = bucketRecords.finish()
  const bucketState = buildBucketState({
    field,
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
  context: IndexReadContext,
  records: RecordIndex,
  groups: readonly GroupDemand[] = [],
  rev = 1
): GroupIndex => {
  const base: GroupIndex = {
    groups: new Map(),
    rev
  }
  const built = ensureGroupIndex(base, context, records, groups)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureGroupIndex = (
  previous: GroupIndex,
  context: IndexReadContext,
  records: RecordIndex,
  groups: readonly GroupDemand[] = []
): GroupIndex => {
  const nextGroups = createMapPatchBuilder(previous.groups)

  groups.forEach(demand => {
    const key = createGroupDemandKey(demand)
    if (nextGroups.has(key) || !context.fieldIdSet.has(demand.fieldId)) {
      return
    }

    nextGroups.set(key, buildGroupFieldIndex(context, records, demand))
  })

  return nextGroups.changed()
    ? {
        groups: nextGroups.finish(),
        rev: previous.rev + 1
      }
    : previous
}

export const syncGroupIndex = (
  previous: GroupIndex,
  context: IndexDeriveContext,
  records: RecordIndex,
  impact: ActiveImpact,
  sectionGroup?: GroupDemand
): GroupIndex => {
  if (!context.changed || !previous.groups.size) {
    return previous
  }

  const nextGroups = createMapPatchBuilder(previous.groups)
  const sectionGroupKey = sectionGroup
    ? createGroupDemandKey(sectionGroup)
    : undefined

  previous.groups.forEach((groupIndex, key) => {
    const fieldId = groupIndex.fieldId
    const isSectionGroup = sectionGroupKey === key
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      if (isSectionGroup) {
        ensureGroupChange(impact).rebuild = true
      }
      nextGroups.delete(key)
      return
    }

    const demand: GroupDemand = {
      fieldId: groupIndex.fieldId,
      mode: groupIndex.mode,
      bucketSort: groupIndex.bucketSort,
      bucketInterval: groupIndex.bucketInterval
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      if (isSectionGroup) {
        ensureGroupChange(impact).rebuild = true
      }
      nextGroups.set(key, buildGroupFieldIndex(context, records, demand, groupIndex))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const nextGroup = syncGroupFieldIndex({
      previous: groupIndex,
      context,
      records,
      touchedRecords: context.touchedRecords,
      ...(isSectionGroup
        ? {
            groupChange: ensureGroupChange(impact)
          }
        : {})
    })
    if (nextGroup !== groupIndex) {
      nextGroups.set(key, nextGroup)
    }
  })

  return nextGroups.changed()
    ? {
        groups: nextGroups.finish(),
        rev: previous.rev + 1
      }
    : previous
}
