import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  BucketKey,
  FilterBucketIndex,
  GroupDemand,
  GroupFieldIndex,
  GroupIndex,
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex,
  SectionGroupIndex
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

const sameBucketSet = (
  left: readonly BucketKey[],
  right: readonly BucketKey[]
) => left.length === right.length
  && left.every(key => right.includes(key))

const createRecordIdSet = (
  ids?: readonly RecordId[]
): ReadonlySet<RecordId> | undefined => ids?.length
  ? new Set(ids)
  : undefined

const buildFilterBucketIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  demand: GroupDemand
): FilterBucketIndex => {
  const field = context.reader.fields.get(demand.fieldId)
  const values = records.values.get(demand.fieldId)?.byRecord
  const recordBuckets = new Map<RecordId, readonly BucketKey[]>()
  const bucketRecords = new Map<BucketKey, RecordId[]>()

  if (field) {
    records.ids.forEach(recordId => {
      const buckets = resolveBucketKeys(
        field,
        values?.get(recordId),
        demand
      )
      recordBuckets.set(recordId, buckets)
      buckets.forEach(bucketKey => {
        addBucketRecord(bucketRecords, bucketKey, recordId)
      })
    })
  }

  return {
    capability: 'filter',
    fieldId: demand.fieldId,
    recordBuckets,
    bucketRecords
  }
}

const buildSectionGroupIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  demand: GroupDemand,
  previous?: SectionGroupIndex
): SectionGroupIndex => {
  const field = context.reader.fields.get(demand.fieldId)
  const values = records.values.get(demand.fieldId)?.byRecord
  const recordSections = new Map<RecordId, readonly BucketKey[]>()
  const sectionRecords = new Map<BucketKey, RecordId[]>()

  if (field) {
    records.ids.forEach(recordId => {
      const sections = resolveBucketKeys(
        field,
        values?.get(recordId),
        demand
      )
      recordSections.set(recordId, sections)
      sections.forEach(sectionKey => {
        addBucketRecord(sectionRecords, sectionKey, recordId)
      })
    })
  }

  const bucketState = buildBucketState({
    field,
    records,
    demand,
    values,
    bucketRecords: sectionRecords,
    previous
  })

  return {
    capability: 'section',
    fieldId: demand.fieldId,
    mode: demand.mode,
    bucketSort: demand.bucketSort,
    bucketInterval: demand.bucketInterval,
    recordSections,
    sectionRecords,
    buckets: bucketState.buckets,
    order: bucketState.order
  }
}

const buildGroupFieldIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  demand: GroupDemand,
  previous?: SectionGroupIndex
): GroupFieldIndex => demand.capability === 'filter'
  ? buildFilterBucketIndex(context, records, demand)
  : buildSectionGroupIndex(context, records, demand, previous)

const syncFilterBucketIndex = (input: {
  previous: FilterBucketIndex
  context: IndexDeriveContext
  records: RecordIndex
  touchedRecords: ReadonlySet<RecordId>
}): FilterBucketIndex => {
  const demand: GroupDemand = {
    fieldId: input.previous.fieldId,
    capability: 'filter'
  }
  const field = input.context.reader.fields.get(demand.fieldId)
  if (!field) {
    return buildFilterBucketIndex(input.context, input.records, demand)
  }

  const values = input.records.values.get(demand.fieldId)?.byRecord
  const touchedBuckets = new Set<BucketKey>()
  const recordBuckets = createMapPatchBuilder(input.previous.recordBuckets)
  const removedByBucket = new Map<BucketKey, RecordId[]>()
  const addedByBucket = new Map<BucketKey, RecordId[]>()
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const before = input.previous.recordBuckets.get(recordId) ?? EMPTY_BUCKET_KEYS
    const after = input.records.order.has(recordId)
      ? resolveBucketKeys(
          field,
          values?.get(recordId),
          demand
        )
      : EMPTY_BUCKET_KEYS

    if (sameBucketSet(before, after)) {
      return
    }

    changed = true
    if (after.length) {
      recordBuckets.set(recordId, after)
    } else {
      recordBuckets.delete(recordId)
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
  })

  if (!changed) {
    return input.previous
  }

  const bucketRecords = createMapPatchBuilder(input.previous.bucketRecords)
  touchedBuckets.forEach(bucketKey => {
    const ids = applyOrderedIdDelta({
      previous: input.previous.bucketRecords.get(bucketKey) ?? EMPTY_RECORD_IDS,
      remove: createRecordIdSet(removedByBucket.get(bucketKey)),
      add: addedByBucket.get(bucketKey),
      order: input.records.order
    })
    if (ids?.length) {
      bucketRecords.set(bucketKey, ids)
      return
    }

    bucketRecords.delete(bucketKey)
  })

  return {
    capability: 'filter',
    fieldId: demand.fieldId,
    recordBuckets: recordBuckets.finish(),
    bucketRecords: bucketRecords.finish()
  }
}

const syncSectionGroupIndex = (input: {
  previous: SectionGroupIndex
  context: IndexDeriveContext
  records: RecordIndex
  touchedRecords: ReadonlySet<RecordId>
  groupChange?: MembershipChange<BucketKey, RecordId>
}): SectionGroupIndex => {
  const demand: GroupDemand = {
    fieldId: input.previous.fieldId,
    capability: 'section',
    mode: input.previous.mode,
    bucketSort: input.previous.bucketSort,
    bucketInterval: input.previous.bucketInterval
  }
  const field = input.context.reader.fields.get(demand.fieldId)
  if (!field) {
    return buildSectionGroupIndex(input.context, input.records, demand)
  }

  const values = input.records.values.get(demand.fieldId)?.byRecord
  const recordSections = createMapPatchBuilder(input.previous.recordSections)
  const localTouchedSections = input.groupChange
    ? undefined
    : new Set<BucketKey>()
  const localRemovedBySection = input.groupChange
    ? undefined
    : new Map<BucketKey, RecordId[]>()
  const localAddedBySection = input.groupChange
    ? undefined
    : new Map<BucketKey, RecordId[]>()
  const touchedSections = input.groupChange?.touchedKeys ?? localTouchedSections!
  const removedBySection = input.groupChange?.removedByKey ?? localRemovedBySection!
  const addedBySection = input.groupChange?.addedByKey ?? localAddedBySection!
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const before = input.previous.recordSections.get(recordId) ?? EMPTY_BUCKET_KEYS
    const nextValue = input.records.order.has(recordId)
      ? values?.get(recordId)
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
    } else {
      before.forEach(sectionKey => {
        touchedSections.add(sectionKey)
        if (!after.includes(sectionKey)) {
          addBucketRecord(removedBySection, sectionKey, recordId)
        }
      })
      after.forEach(sectionKey => {
        touchedSections.add(sectionKey)
        if (!before.includes(sectionKey)) {
          addBucketRecord(addedBySection, sectionKey, recordId)
        }
      })
    }

    if (after.length) {
      recordSections.set(recordId, after)
      return
    }

    recordSections.delete(recordId)
  })

  if (!changed) {
    return input.previous
  }

  const nextRecordSections = recordSections.finish()
  const sectionRecords = createMapPatchBuilder(input.previous.sectionRecords)

  touchedSections.forEach(sectionKey => {
    const ids = applyOrderedIdDelta({
      previous: input.previous.sectionRecords.get(sectionKey) ?? EMPTY_RECORD_IDS,
      remove: createRecordIdSet(removedBySection.get(sectionKey)),
      add: addedBySection.get(sectionKey),
      order: input.records.order
    })
    if (ids?.length) {
      sectionRecords.set(sectionKey, ids)
      return
    }

    sectionRecords.delete(sectionKey)
  })

  const nextSectionRecords = sectionRecords.finish()
  const bucketState = buildBucketState({
    field,
    records: input.records,
    demand,
    values,
    bucketRecords: nextSectionRecords,
    previous: input.previous
  })

  return {
    capability: 'section',
    fieldId: demand.fieldId,
    mode: demand.mode,
    bucketSort: demand.bucketSort,
    bucketInterval: demand.bucketInterval,
    recordSections: nextRecordSections,
    sectionRecords: nextSectionRecords,
    buckets: bucketState.buckets,
    order: bucketState.order
  }
}

const toGroupDemand = (
  groupIndex: GroupFieldIndex
): GroupDemand => groupIndex.capability === 'filter'
  ? {
      fieldId: groupIndex.fieldId,
      capability: 'filter'
    }
  : {
      fieldId: groupIndex.fieldId,
      capability: 'section',
      mode: groupIndex.mode,
      bucketSort: groupIndex.bucketSort,
      bucketInterval: groupIndex.bucketInterval
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
  impact: ActiveImpact
): GroupIndex => {
  if (!context.changed || !previous.groups.size) {
    return previous
  }

  const nextGroups = createMapPatchBuilder(previous.groups)

  previous.groups.forEach((groupIndex, key) => {
    const fieldId = groupIndex.fieldId
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      if (groupIndex.capability === 'section') {
        ensureGroupChange(impact).rebuild = true
      }
      nextGroups.delete(key)
      return
    }

    const demand = toGroupDemand(groupIndex)

    if (shouldRebuildFieldIndex(context, fieldId)) {
      if (groupIndex.capability === 'section') {
        ensureGroupChange(impact).rebuild = true
      }
      nextGroups.set(key, buildGroupFieldIndex(
        context,
        records,
        demand,
        groupIndex.capability === 'section'
          ? groupIndex
          : undefined
      ))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const nextGroup = groupIndex.capability === 'filter'
      ? syncFilterBucketIndex({
          previous: groupIndex,
          context,
          records,
          touchedRecords: context.touchedRecords
        })
      : syncSectionGroupIndex({
          previous: groupIndex,
          context,
          records,
          touchedRecords: context.touchedRecords,
          groupChange: ensureGroupChange(impact)
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
