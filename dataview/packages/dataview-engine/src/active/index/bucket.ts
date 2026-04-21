import type {
  Field,
  RecordId,
  ViewGroup
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  compareGroupBuckets
} from '@dataview/core/field/kind'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortLabel,
  readBucketSortValue,
  type Bucket
} from '@dataview/core/field/kind/group'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import {
  applyOrderedIdDelta
} from '@dataview/engine/active/shared/ordered'
import {
  applyMembershipTransition,
  type MembershipTransition
} from '@dataview/engine/active/shared/transition'
import {
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'
import type {
  BucketIndex,
  BucketKey,
  BucketSpec,
  BucketFieldIndex,
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex
} from '@dataview/engine/active/index/contracts'

const EMPTY_BUCKET_KEYS: readonly BucketKey[] = []
const EMPTY_RECORD_IDS: readonly RecordId[] = []

export const createBucketSpec = (
  input: Pick<ViewGroup, 'field'>
    & Partial<Pick<ViewGroup, 'mode' | 'bucketInterval'>>
): BucketSpec => ({
  fieldId: input.field,
  ...(input.mode === undefined ? {} : { mode: input.mode }),
  ...(input.bucketInterval === undefined ? {} : { interval: input.bucketInterval })
})

export const createBucketSpecKey = (
  spec: BucketSpec
): string => [
  spec.fieldId,
  spec.mode ?? '',
  spec.interval ?? ''
].join('\u0000')

export const readBucketIndex = (
  index: BucketIndex,
  spec: BucketSpec
): BucketFieldIndex | undefined => index.fields.get(createBucketSpecKey(spec))

export const sameBucketSpecs = (
  left: readonly BucketSpec[],
  right: readonly BucketSpec[]
) => left.length === right.length
  && left.every((spec, index) => {
    const next = right[index]
    return next !== undefined
      && spec.fieldId === next.fieldId
      && spec.mode === next.mode
      && spec.interval === next.interval
  })

const sameBucketKeys = (
  left: readonly BucketKey[],
  right: readonly BucketKey[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const addBucketRecord = (
  target: Map<BucketKey, RecordId[]>,
  key: BucketKey,
  recordId: RecordId
) => {
  const records = target.get(key)
  if (records) {
    records.push(recordId)
    return
  }

  target.set(key, [recordId])
}

const createRecordIdSet = (
  ids?: readonly RecordId[]
): ReadonlySet<RecordId> | undefined => ids?.length
  ? new Set(ids)
  : undefined

const resolveFastBucketKeys = (
  field: Field | undefined,
  value: unknown
): readonly BucketKey[] | undefined => fieldSpec.index.bucket.keys(field, value)

const toGroupOptions = (input: {
  spec: BucketSpec
  sort?: ViewGroup['bucketSort']
}): Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>> => ({
  ...(input.spec.mode === undefined ? {} : { mode: input.spec.mode }),
  ...(input.sort === undefined ? {} : { bucketSort: input.sort }),
  ...(input.spec.interval === undefined ? {} : { bucketInterval: input.spec.interval })
})

export const resolveBucketKeys = (
  field: Field | undefined,
  value: unknown,
  spec: BucketSpec
): readonly BucketKey[] => (
  resolveFastBucketKeys(field, value)
    ?? fieldApi.group.entries(
      field,
      value,
      toGroupOptions({ spec })
    ).map(bucket => String(bucket.key))
)

const buildBucketFieldIndex = (input: {
  context: IndexReadContext
  records: RecordIndex
  spec: BucketSpec
}): BucketFieldIndex => {
  const field = input.context.reader.fields.get(input.spec.fieldId)
  const values = input.records.values.get(input.spec.fieldId)?.byRecord
  const keysByRecord = new Map<RecordId, readonly BucketKey[]>()
  const recordsByKey = new Map<BucketKey, RecordId[]>()

  if (field) {
    input.records.ids.forEach(recordId => {
      const keys = resolveBucketKeys(field, values?.get(recordId), input.spec)
      keysByRecord.set(recordId, keys)
      keys.forEach(key => {
        addBucketRecord(recordsByKey, key, recordId)
      })
    })
  }

  return {
    spec: input.spec,
    ...(field ? { field } : {}),
    keysByRecord,
    recordsByKey
  }
}

const syncBucketFieldIndex = (input: {
  previous: BucketFieldIndex
  context: IndexDeriveContext
  records: RecordIndex
  touchedRecords: ReadonlySet<RecordId>
  transition?: MembershipTransition<BucketKey, RecordId>
}): BucketFieldIndex => {
  const field = input.context.reader.fields.get(input.previous.spec.fieldId)
  if (!field) {
    return buildBucketFieldIndex({
      context: input.context,
      records: input.records,
      spec: input.previous.spec
    })
  }

  const values = input.records.values.get(input.previous.spec.fieldId)?.byRecord
  const keysByRecord = createMapPatchBuilder(input.previous.keysByRecord)
  const touchedKeys = new Set<BucketKey>()
  const removedByKey = new Map<BucketKey, RecordId[]>()
  const addedByKey = new Map<BucketKey, RecordId[]>()
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const before = input.previous.keysByRecord.get(recordId) ?? EMPTY_BUCKET_KEYS
    const after = input.records.order.has(recordId)
      ? resolveBucketKeys(field, values?.get(recordId), input.previous.spec)
      : EMPTY_BUCKET_KEYS

    if (sameBucketKeys(before, after)) {
      return
    }

    changed = true
    input.transition && applyMembershipTransition(input.transition, recordId, before, after)
    before.forEach(bucketKey => {
      touchedKeys.add(bucketKey)
      if (!after.includes(bucketKey)) {
        addBucketRecord(removedByKey, bucketKey, recordId)
      }
    })
    after.forEach(bucketKey => {
      touchedKeys.add(bucketKey)
      if (!before.includes(bucketKey)) {
        addBucketRecord(addedByKey, bucketKey, recordId)
      }
    })

    if (after.length) {
      keysByRecord.set(recordId, after)
      return
    }

    keysByRecord.delete(recordId)
  })

  if (!changed) {
    return input.previous
  }

  const recordsByKey = createMapPatchBuilder(input.previous.recordsByKey)
  touchedKeys.forEach(bucketKey => {
    const ids = applyOrderedIdDelta({
      previous: input.previous.recordsByKey.get(bucketKey) ?? EMPTY_RECORD_IDS,
      remove: createRecordIdSet(removedByKey.get(bucketKey)),
      add: addedByKey.get(bucketKey),
      order: input.records.order
    })
    if (ids?.length) {
      recordsByKey.set(bucketKey, ids)
      return
    }

    recordsByKey.delete(bucketKey)
  })

  return {
    spec: input.previous.spec,
    field,
    keysByRecord: keysByRecord.finish(),
    recordsByKey: recordsByKey.finish()
  }
}

export const buildBucketIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  specs: readonly BucketSpec[] = [],
  rev = 1
): BucketIndex => {
  const base: BucketIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureBucketIndex(base, context, records, specs)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureBucketIndex = (
  previous: BucketIndex,
  context: IndexReadContext,
  records: RecordIndex,
  specs: readonly BucketSpec[] = []
): BucketIndex => {
  const nextSpecKeys = new Set(specs.map(spec => createBucketSpecKey(spec)))
  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((_field, key) => {
    if (!nextSpecKeys.has(key)) {
      fields.delete(key)
    }
  })

  specs.forEach(spec => {
    const key = createBucketSpecKey(spec)
    if (fields.has(key) || !context.fieldIdSet.has(spec.fieldId)) {
      return
    }

    fields.set(key, buildBucketFieldIndex({
      context,
      records,
      spec
    }))
  })

  return fields.changed()
    ? {
        fields: fields.finish(),
        rev: previous.rev + 1
      }
    : previous
}

export const syncBucketIndex = (
  previous: BucketIndex,
  context: IndexDeriveContext,
  records: RecordIndex,
  transition: MembershipTransition<BucketKey, RecordId>
): BucketIndex => {
  if (!context.changed || !previous.fields.size) {
    return previous
  }

  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((previousField, key) => {
    const fieldId = previousField.spec.fieldId
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      fields.delete(key)
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      transition.rebuild = true
      fields.set(key, buildBucketFieldIndex({
        context,
        records,
        spec: previousField.spec
      }))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const nextField = syncBucketFieldIndex({
      previous: previousField,
      context,
      records,
      touchedRecords: context.touchedRecords,
      transition
    })

    if (nextField !== previousField) {
      fields.set(key, nextField)
    }
  })

  return fields.changed()
    ? {
        fields: fields.finish(),
        rev: previous.rev + 1
      }
    : previous
}

const cloneBucket = (bucket: Bucket): Bucket => ({
  ...bucket
})

const sameBucket = (
  left: Bucket | undefined,
  right: Bucket | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return left.key === right.key
    && readBucketSortLabel(left) === readBucketSortLabel(right)
    && left.value === right.value
    && left.clearValue === right.clearValue
    && left.empty === right.empty
    && left.color === right.color
    && readBucketOrder(left) === readBucketOrder(right)
    && readBucketSortValue(left) === readBucketSortValue(right)
}

const sameBuckets = (
  left: ReadonlyMap<BucketKey, Bucket>,
  right: ReadonlyMap<BucketKey, Bucket>
) => {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, bucket] of left) {
    if (!sameBucket(bucket, right.get(key))) {
      return false
    }
  }

  return true
}

const compareResolvedBuckets = (
  left: Bucket,
  right: Bucket,
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'bucketSort' | 'mode' | 'bucketInterval'>>
) => {
  if (field?.kind === 'title') {
    const bucketSort = fieldApi.group.meta(field, group).sort || 'manual'
    switch (bucketSort) {
      case 'labelAsc':
        return compareLabels(readBucketSortLabel(left), readBucketSortLabel(right)) || readBucketOrder(left) - readBucketOrder(right)
      case 'labelDesc':
        return compareLabels(readBucketSortLabel(right), readBucketSortLabel(left)) || readBucketOrder(left) - readBucketOrder(right)
      case 'valueAsc':
        return compareGroupSortValues(readBucketSortValue(left), readBucketSortValue(right))
          || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
          || readBucketOrder(left) - readBucketOrder(right)
      case 'valueDesc':
        return compareGroupSortValues(readBucketSortValue(right), readBucketSortValue(left))
          || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
          || readBucketOrder(left) - readBucketOrder(right)
      case 'manual':
      default:
        return readBucketOrder(left) - readBucketOrder(right) || compareLabels(readBucketSortLabel(left), readBucketSortLabel(right))
    }
  }

  return compareGroupBuckets(left, right, field, group)
}

export const buildBucketViewState = (input: {
  field: Field | undefined
  spec: BucketSpec
  sort?: ViewGroup['bucketSort']
  values?: ReadonlyMap<RecordId, unknown>
  recordsByKey: ReadonlyMap<BucketKey, readonly RecordId[]>
  previous?: {
    buckets: ReadonlyMap<BucketKey, Bucket>
    order: readonly BucketKey[]
  }
}): {
  buckets: ReadonlyMap<BucketKey, Bucket>
  order: readonly BucketKey[]
} => {
  const field = input.field
  if (!field) {
    return {
      buckets: input.previous?.buckets ?? new Map(),
      order: input.previous?.order ?? []
    }
  }

  const groupOptions = toGroupOptions({
    spec: input.spec,
    sort: input.sort
  })
  const nextBuckets = new Map<BucketKey, Bucket>(
    fieldApi.group.domain(field, groupOptions)
      .map((bucket: Bucket) => [bucket.key as BucketKey, cloneBucket(bucket)] as const)
  )

  input.recordsByKey.forEach((ids, key) => {
    if (nextBuckets.has(key)) {
      return
    }

    const recordId = ids[0]
    const descriptor = recordId
      ? fieldApi.group.entries(
        field,
        input.values?.get(recordId),
        groupOptions
      ).find((bucket: Bucket) => String(bucket.key) === key)
      : undefined

    nextBuckets.set(key, descriptor
      ? cloneBucket(descriptor)
      : {
          key,
          label: key,
          value: key,
          clearValue: false,
          empty: false,
          sortLabel: key
        })
  })

  const nextOrder = [...nextBuckets.values()]
    .sort((left, right) => compareResolvedBuckets(left, right, field, groupOptions))
    .map(bucket => bucket.key as BucketKey)

  return {
    buckets: input.previous && sameBuckets(input.previous.buckets, nextBuckets)
      ? input.previous.buckets
      : nextBuckets,
    order: input.previous && sameBucketKeys(input.previous.order, nextOrder)
      ? input.previous.order
      : nextOrder
  }
}
