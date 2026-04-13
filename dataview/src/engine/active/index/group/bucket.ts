import type {
  DataDoc,
  Field,
  RecordId,
  ViewGroup
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  compareGroupBuckets,
  getFieldGroupMeta,
  getRecordFieldValue,
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
  readBucketSortValue,
  type Bucket
} from '@dataview/core/field/kind/group'
import type {
  BucketKey,
  GroupDemand,
  GroupFieldIndex,
  RecordIndex,
  SortedIdSet
} from '../contracts'
import {
  toGroupOptions
} from './demand'

export const sameBucketKeys = (
  left: readonly BucketKey[],
  right: readonly BucketKey[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

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
        return compareLabels(left.title, right.title) || readBucketOrder(left) - readBucketOrder(right)
      case 'labelDesc':
        return compareLabels(right.title, left.title) || readBucketOrder(left) - readBucketOrder(right)
      case 'valueAsc':
        return compareGroupSortValues(readBucketSortValue(left), readBucketSortValue(right))
          || compareLabels(left.title, right.title)
          || readBucketOrder(left) - readBucketOrder(right)
      case 'valueDesc':
        return compareGroupSortValues(readBucketSortValue(right), readBucketSortValue(left))
          || compareLabels(left.title, right.title)
          || readBucketOrder(left) - readBucketOrder(right)
      case 'manual':
      default:
        return readBucketOrder(left) - readBucketOrder(right) || compareLabels(left.title, right.title)
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
      return [toScalarBucketKey(value)]
    case 'multiSelect':
      return Array.isArray(value) && value.length
        ? value.map(item => toScalarBucketKey(item))
        : [KANBAN_EMPTY_BUCKET_KEY]
    case 'boolean':
      return value === true
        ? ['true']
        : value === false
          ? ['false']
          : [KANBAN_EMPTY_BUCKET_KEY]
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
    && left.title === right.title
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
) => left.size === right.size
  && Array.from(left.entries()).every(([key, bucket]) => sameBucket(bucket, right.get(key)))

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
  document: DataDoc
  records: RecordIndex
  demand: GroupDemand
  bucketRecords: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
  previous?: GroupFieldIndex
}): Pick<GroupFieldIndex, 'buckets' | 'order'> => {
  const field = getDocumentFieldById(input.document, input.demand.fieldId)
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
    const record = recordId
      ? input.records.rows.get(recordId)
      : undefined
    const descriptor = record
      ? resolveFieldGroupBucketEntries(
        field,
        getRecordFieldValue(record, input.demand.fieldId),
        groupOptions
      ).find(bucket => String(bucket.key) === key)
      : undefined

    nextBuckets.set(key, descriptor
      ? cloneBucket(descriptor)
      : {
          key,
          title: key,
          value: key,
          clearValue: false,
          empty: false
        })
  })

  const nextOrder = Array.from(nextBuckets.values())
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
