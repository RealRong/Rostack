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
  getRecordFieldValue
} from '@dataview/core/field'
import {
  createFieldSyncContext,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '#engine/active/index/sync'
import type {
  BucketKey,
  GroupDemand,
  GroupFieldIndex,
  GroupIndex,
  RecordIndex,
  RecordBucketLookup,
  SortedIdSet
} from '#engine/active/index/contracts'
import {
  buildBucketState,
  resolveBucketKeys,
  sameBucketKeys
} from '#engine/active/index/group/bucket'
import {
  createGroupDemandKey
} from '#engine/active/index/group/demand'

class PatchedRecordBuckets implements RecordBucketLookup {
  constructor(
    readonly base: RecordBucketLookup,
    readonly patches: ReadonlyMap<RecordId, readonly BucketKey[] | null>
  ) {}

  get(
    recordId: RecordId
  ): readonly BucketKey[] | undefined {
    if (this.patches.has(recordId)) {
      return this.patches.get(recordId) ?? undefined
    }

    return this.base.get(recordId)
  }
}

const createPatchedRecordBuckets = (
  previous: RecordBucketLookup,
  patches: ReadonlyMap<RecordId, readonly BucketKey[] | null>
): RecordBucketLookup => {
  if (!patches.size) {
    return previous
  }

  if (previous instanceof PatchedRecordBuckets) {
    const merged = new Map(previous.patches)
    patches.forEach((bucketKeys, recordId) => {
      merged.set(recordId, bucketKeys)
    })
    return new PatchedRecordBuckets(previous.base, merged)
  }

  return new PatchedRecordBuckets(previous, patches)
}

const buildGroupFieldIndex = (
  document: DataDoc,
  records: RecordIndex,
  demand: GroupDemand,
  previous?: GroupFieldIndex
): GroupFieldIndex => {
  const field = getDocumentFieldById(document, demand.fieldId)
  const recordBuckets = new Map<RecordId, readonly BucketKey[]>()
  const bucketRecords = new Map<BucketKey, RecordId[]>()

  if (field) {
    records.ids.forEach(recordId => {
      const row = records.rows.get(recordId)
      const buckets = resolveBucketKeys(
        field,
        row ? getRecordFieldValue(row, demand.fieldId) : undefined,
        demand
      )
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

const insertBucketMember = (
  ids: RecordId[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
) => {
  if (ids.includes(recordId)) {
    return
  }

  const nextOrder = order.get(recordId) ?? Number.MAX_SAFE_INTEGER
  const index = ids.findIndex(current => (
    (order.get(current) ?? Number.MAX_SAFE_INTEGER) > nextOrder
  ))

  if (index < 0) {
    ids.push(recordId)
    return
  }

  ids.splice(index, 0, recordId)
}

const removeBucketMemberships = (
  bucketRecords: Map<BucketKey, RecordId[]>,
  ensureIds: (bucketKey: BucketKey) => RecordId[],
  bucketKeys: readonly BucketKey[],
  recordId: RecordId
) => {
  bucketKeys.forEach(bucketKey => {
    const ids = ensureIds(bucketKey)
    const index = ids.indexOf(recordId)
    if (index < 0) {
      return
    }

    ids.splice(index, 1)
    if (ids.length) {
      return
    }

    bucketRecords.delete(bucketKey)
  })
}

const addBucketMemberships = (
  bucketRecords: Map<BucketKey, RecordId[]>,
  ensureIds: (bucketKey: BucketKey) => RecordId[],
  bucketKeys: readonly BucketKey[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
) => {
  bucketKeys.forEach(bucketKey => {
    insertBucketMember(ensureIds(bucketKey), recordId, order)
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

  let nextBucketRecords: Map<BucketKey, RecordId[]> | undefined
  const touchedBuckets = new Set<BucketKey>()
  const ensureBucketRecords = () => {
    if (!nextBucketRecords) {
      nextBucketRecords = new Map(
        Array.from(input.previous.bucketRecords.entries()).map(([bucketKey, ids]) => (
          [bucketKey, ids as RecordId[]] as const
        ))
      )
    }

    return nextBucketRecords
  }
  const ensureBucketIds = (
    bucketKey: BucketKey
  ) => {
    const bucketRecords = ensureBucketRecords()
    if (touchedBuckets.has(bucketKey)) {
      const ids = bucketRecords.get(bucketKey)
      if (ids) {
        return ids
      }

      const nextIds: RecordId[] = []
      bucketRecords.set(bucketKey, nextIds)
      return nextIds
    }

    const nextIds = [...(bucketRecords.get(bucketKey) ?? [])]
    bucketRecords.set(bucketKey, nextIds)
    touchedBuckets.add(bucketKey)
    return nextIds
  }
  const recordBucketPatches = new Map<RecordId, readonly BucketKey[] | null>()
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const before = input.previous.recordBuckets.get(recordId) ?? []
    const row = input.records.rows.get(recordId)
    const nextValue = input.records.order.has(recordId) && row
      ? getRecordFieldValue(row, demand.fieldId)
      : undefined
    const after = input.records.order.has(recordId)
      ? resolveBucketKeys(field, nextValue, demand)
      : []

    if (sameBucketKeys(before, after)) {
      return
    }

    if (before.length) {
      removeBucketMemberships(ensureBucketRecords(), ensureBucketIds, before, recordId)
    }

    if (after.length) {
      addBucketMemberships(
        ensureBucketRecords(),
        ensureBucketIds,
        after,
        recordId,
        input.records.order
      )
      recordBucketPatches.set(recordId, after)
    } else {
      recordBucketPatches.set(recordId, null)
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
    bucketRecords: nextBucketRecords ?? input.previous.bucketRecords,
    previous: input.previous
  })

  return {
    fieldId: demand.fieldId,
    mode: demand.mode,
    bucketSort: demand.bucketSort,
    bucketInterval: demand.bucketInterval,
    recordBuckets: createPatchedRecordBuckets(
      input.previous.recordBuckets,
      recordBucketPatches
    ),
    bucketRecords: nextBucketRecords ?? input.previous.bucketRecords,
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
