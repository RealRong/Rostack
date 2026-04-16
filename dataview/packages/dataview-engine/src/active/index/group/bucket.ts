import type {
  Field,
  RecordId,
  ViewGroup
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/contracts'
import {
  compareGroupBuckets,
  getFieldGroupMeta,
  resolveFieldGroupBucketDomain,
  resolveFieldGroupBucketEntries
} from '@dataview/core/field'
import {
  trimToUndefined
} from '@shared/core'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortLabel,
  readBucketSortValue,
  type Bucket
} from '@dataview/core/field/kind/group'
import type {
  BucketKey,
  GroupDemand,
  RecordIndex,
  SectionGroupIndex,
  SortedIdSet
} from '@dataview/engine/active/index/contracts'
import {
  toGroupOptions
} from '@dataview/engine/active/index/group/demand'

export const sameBucketKeys = (
  left: readonly BucketKey[],
  right: readonly BucketKey[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const SINGLE_BUCKET_KEYS = new Map<BucketKey, readonly BucketKey[]>()

const readSingleBucketKeys = (
  key: BucketKey
): readonly BucketKey[] => {
  const cached = SINGLE_BUCKET_KEYS.get(key)
  if (cached) {
    return cached
  }

  const created = [key] as readonly BucketKey[]
  SINGLE_BUCKET_KEYS.set(key, created)
  return created
}

const toScalarBucketKey = (
  value: unknown
): BucketKey => {
  if (value === undefined || value === null) {
    return KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'string') {
    const normalized = trimToUndefined(value)
    return normalized
      ? normalized
      : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? String(value)
      : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'boolean') {
    return value
      ? 'true'
      : 'false'
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const compareResolvedGroupBuckets = (
  left: Bucket,
  right: Bucket,
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'bucketSort' | 'mode' | 'bucketInterval'>>
) => {
  if (field?.kind === 'title') {
    const bucketSort = getFieldGroupMeta(field, group).sort || 'manual'
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

const resolveFastBucketKeys = (
  field: Field | undefined,
  value: unknown
): readonly BucketKey[] | undefined => {
  switch (field?.kind) {
    case 'status':
    case 'select':
      return readSingleBucketKeys(toScalarBucketKey(value))
    case 'multiSelect':
      return Array.isArray(value) && value.length
        ? value.length === 1
          ? readSingleBucketKeys(toScalarBucketKey(value[0]))
          : value.map(item => toScalarBucketKey(item))
        : readSingleBucketKeys(KANBAN_EMPTY_BUCKET_KEY)
    case 'boolean':
      return value === true
        ? readSingleBucketKeys('true')
        : value === false
          ? readSingleBucketKeys('false')
          : readSingleBucketKeys(KANBAN_EMPTY_BUCKET_KEY)
    default:
      return undefined
  }
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

export const resolveBucketKeys = (
  field: Field | undefined,
  value: unknown,
  demand: GroupDemand
): readonly BucketKey[] => (
  resolveFastBucketKeys(field, value)
    ?? resolveFieldGroupBucketEntries(
      field,
      value,
      toGroupOptions(demand)
    ).map(bucket => String(bucket.key))
)

export const buildBucketState = (input: {
  field: Field | undefined
  records: RecordIndex
  demand: GroupDemand
  values?: ReadonlyMap<RecordId, unknown>
  bucketRecords: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
  previous?: SectionGroupIndex
}): Pick<SectionGroupIndex, 'buckets' | 'order'> => {
  const field = input.field
  if (!field) {
    return {
      buckets: input.previous?.buckets ?? new Map(),
      order: input.previous?.order ?? []
    }
  }

  const groupOptions = toGroupOptions(input.demand)
  const nextBuckets = new Map<BucketKey, Bucket>(
    resolveFieldGroupBucketDomain(field, groupOptions)
      .map(bucket => [bucket.key as BucketKey, cloneBucket(bucket)] as const)
  )

  input.bucketRecords.forEach((ids, key) => {
    if (nextBuckets.has(key)) {
      return
    }

    const recordId = ids[0]
    const descriptor = recordId
      ? resolveFieldGroupBucketEntries(
        field,
        input.values?.get(recordId),
        groupOptions
      ).find(bucket => String(bucket.key) === key)
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
    .sort((left, right) => compareResolvedGroupBuckets(left, right, field, groupOptions))
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
