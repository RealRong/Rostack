import type {
  DataDoc,
  Field,
  Row,
  ViewGroup,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  compareGroupBuckets,
  getFieldGroupMeta,
  getRecordFieldValue,
  resolveFieldGroupBucketDomain,
  resolveFieldGroupBucketEntries,
  type Bucket
} from '@dataview/core/field'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortValue
} from '@dataview/core/field/kind/group'
import type {
  ResolvedGroup,
  ViewGroupProjection
} from './types'

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

interface ObservedGroup {
  descriptor: Bucket
  records: string[]
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
    .sort((left, right) => (
      compareResolvedGroupBuckets(
        left.descriptor,
        right.descriptor,
        field,
        group
      )
    ))
    .map(entry => ({
      ...entry.descriptor,
      records: [...entry.records]
    }))
}

export const resolveViewGroupProjection = (
  document: DataDoc,
  viewId: ViewId
): ViewGroupProjection | undefined => {
  const view = getDocumentViewById(document, viewId)
  if (!view) {
    return undefined
  }

  const group = view.group
  const field = group
    ? getDocumentFieldById(document, group.field)
    : undefined

  if (!group) {
    return {
      viewId,
      active: false,
      fieldId: '',
      field: undefined,
      fieldLabel: '',
      mode: '',
      bucketSort: undefined,
      bucketInterval: undefined,
      showEmpty: true,
      availableModes: [],
      availableBucketSorts: [],
      supportsInterval: false
    }
  }

  if (!field) {
    return {
      viewId,
      group,
      active: true,
      fieldId: group.field,
      field: undefined,
      fieldLabel: 'Deleted field',
      mode: group.mode,
      bucketSort: group.bucketSort,
      bucketInterval: group.bucketInterval,
      showEmpty: group.showEmpty !== false,
      availableModes: [],
      availableBucketSorts: [],
      supportsInterval: false
    }
  }

  const meta = getFieldGroupMeta(field, {
    mode: group.mode,
    bucketSort: group.bucketSort,
    ...(group.bucketInterval !== undefined
      ? { bucketInterval: group.bucketInterval }
      : {})
  })

  return {
    viewId,
    group,
    active: true,
    fieldId: field.id,
    field,
    fieldLabel: field.name,
    mode: meta.mode,
    bucketSort: meta.sort || undefined,
    bucketInterval: meta.bucketInterval,
    showEmpty: meta.showEmpty !== false,
    availableModes: meta.modes,
    availableBucketSorts: meta.sorts,
    supportsInterval: meta.supportsInterval
  }
}
