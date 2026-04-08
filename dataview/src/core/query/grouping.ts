import type {
  DataDoc,
  Field,
  ViewGroup,
  Row,
  RecordId
} from '../contracts'
import { getDocumentFieldById } from '../document'
import {
  compareGroupBuckets,
  type Bucket
} from '../field'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortValue
} from '../field/kind/group'
import {
  getFieldGroupMeta,
  getRecordFieldValue,
  resolveFieldGroupBucketDomain,
  resolveFieldGroupBucketEntries
} from '../field'

const compareResolvedGroupBuckets = (
  left: Bucket,
  right: Bucket,
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'bucketSort' | 'mode'>>
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

export interface ResolvedGroup extends Bucket {
  records: RecordId[]
}

interface ObservedGroup {
  descriptor: Bucket
  records: RecordId[]
}

export const resolveGroupedRecords = (
  document: DataDoc,
  records: readonly Row[],
  group: ViewGroup | undefined
): ResolvedGroup[] => {
  if (!group) {
    return []
  }

  const field = getDocumentFieldById(document, group.field)
  if (!field) {
    return []
  }
  const observed = new Map<string, ObservedGroup>()

  records.forEach(record => {
    resolveFieldGroupBucketEntries(
      field,
      getRecordFieldValue(record, group.field),
      group
    ).forEach(entry => {
      const current = observed.get(entry.key)
      if (current) {
        current.records.push(record.id)
        return
      }

      observed.set(entry.key, {
        descriptor: {
          ...entry
        },
        records: [record.id]
      })
    })
  })

  const resolved = new Map<string, ObservedGroup>()

  resolveFieldGroupBucketDomain(field, group).forEach(descriptor => {
    resolved.set(descriptor.key, {
      descriptor: {
        ...descriptor
      },
      records: observed.get(descriptor.key)?.records ?? []
    })
  })

  observed.forEach((entry, key) => {
    if (!resolved.has(key)) {
      resolved.set(key, entry)
    }
  })

  return Array.from(resolved.values())
    .sort((left, right) => compareResolvedGroupBuckets(left.descriptor, right.descriptor, field, group))
    .map(entry => ({
      ...entry.descriptor,
      records: [...entry.records]
    }))
}
