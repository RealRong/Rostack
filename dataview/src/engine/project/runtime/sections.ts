import type {
  DataDoc,
  RecordId,
  View,
  ViewGroup
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  getRecordFieldValue,
  compareGroupBuckets,
  getFieldGroupMeta,
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
  IndexState
} from '../../index/types'
import type {
  AppearanceList,
  Section,
  SectionKey
} from '../types'
import type {
  QueryState,
  SectionNodeState,
  SectionState
} from './state'

const ROOT_SECTION_KEY = 'root' as SectionKey

const sameIds = (
  left: readonly RecordId[],
  right: readonly RecordId[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const sameBucket = (
  left: SectionNodeState['bucket'],
  right: SectionNodeState['bucket']
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
}

const sameNode = (
  left: SectionNodeState,
  right: SectionNodeState
) => left.key === right.key
  && left.title === right.title
  && left.color === right.color
  && left.visible === right.visible
  && left.collapsed === right.collapsed
  && sameIds(left.ids, right.ids)
  && sameBucket(left.bucket, right.bucket)

const compareResolvedGroupBuckets = (
  left: Bucket,
  right: Bucket,
  field: ReturnType<typeof getDocumentFieldById>,
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

const insertOrdered = (
  ids: readonly RecordId[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => {
  if (ids.includes(recordId)) {
    return ids
  }

  const nextOrder = order.get(recordId) ?? Number.MAX_SAFE_INTEGER
  const next = [...ids]
  const index = next.findIndex(current => (
    (order.get(current) ?? Number.MAX_SAFE_INTEGER) > nextOrder
  ))

  if (index < 0) {
    next.push(recordId)
    return next
  }

  next.splice(index, 0, recordId)
  return next
}

const removeId = (
  ids: readonly RecordId[],
  recordId: RecordId
): readonly RecordId[] => {
  const index = ids.indexOf(recordId)
  if (index < 0) {
    return ids
  }

  return [
    ...ids.slice(0, index),
    ...ids.slice(index + 1)
  ]
}

const visibleOf = (
  ids: readonly RecordId[],
  group: ViewGroup | undefined,
  sectionKey: SectionKey
) => {
  if (!group) {
    return true
  }

  const state = group.buckets?.[sectionKey]
  if (state?.hidden === true) {
    return false
  }

  return group.showEmpty !== false || ids.length > 0
}

const collapsedOf = (
  group: ViewGroup | undefined,
  sectionKey: SectionKey
) => group?.buckets?.[sectionKey]?.collapsed === true

const resolveSectionKeys = (input: {
  recordId: RecordId
  query: QueryState
  view: View
  index: IndexState
}): readonly SectionKey[] => {
  if (!input.query.visibleSet.has(input.recordId)) {
    return []
  }

  const group = input.view.group
  if (!group) {
    return [ROOT_SECTION_KEY]
  }

  return input.index.group.fields.get(group.field)?.recordBuckets.get(input.recordId) ?? []
}

const buildGroupedDescriptors = (input: {
  document: DataDoc
  view: View
  index: IndexState
  idsByKey: ReadonlyMap<SectionKey, readonly RecordId[]>
}): {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, Bucket>
} => {
  const group = input.view.group
  const field = group ? getDocumentFieldById(input.document, group.field) : undefined
  if (!group || !field) {
    return {
      order: [],
      byKey: new Map()
    }
  }

  const descriptors = new Map<SectionKey, Bucket>(
    resolveFieldGroupBucketDomain(field, group)
      .map(bucket => [bucket.key as SectionKey, { ...bucket }] as const)
  )

  input.idsByKey.forEach((ids, key) => {
    if (descriptors.has(key)) {
      return
    }

    const recordId = ids[0]
    if (!recordId) {
      descriptors.set(key, {
        key,
        title: key,
        value: key,
        clearValue: false,
        empty: false
      })
      return
    }

    const record = input.index.records.rows.get(recordId)
    if (!record) {
      descriptors.set(key, {
        key,
        title: key,
        value: key,
        clearValue: false,
        empty: false
      })
      return
    }

    const entries = resolveFieldGroupBucketEntries(
      field,
      getRecordFieldValue(record, group.field),
      group
    )
    const descriptor = entries.find(entry => entry.key === key)
    descriptors.set(key, descriptor
      ? { ...descriptor }
      : {
          key,
          title: key,
          value: key,
          clearValue: false,
          empty: false
        })
  })

  const order = Array.from(descriptors.values())
    .sort((left, right) => compareResolvedGroupBuckets(left, right, field, group))
    .map(bucket => bucket.key as SectionKey)

  return {
    order,
    byKey: descriptors
  }
}

const buildFromScratch = (input: {
  document: DataDoc
  view: View
  query: QueryState
  index: IndexState
  previous?: SectionState
}): SectionState => {
  if (!input.view.group) {
    const root: SectionNodeState = {
      key: ROOT_SECTION_KEY,
      title: 'All',
      ids: input.query.visible,
      visible: true,
      collapsed: false
    }

    const previousRoot = input.previous?.byKey.get(ROOT_SECTION_KEY)
    return {
      order: [ROOT_SECTION_KEY],
      byKey: new Map([
        [ROOT_SECTION_KEY, previousRoot && sameNode(previousRoot, root) ? previousRoot : root] as const
      ]),
      byRecord: new Map(
        input.query.visible.map(recordId => [recordId, [ROOT_SECTION_KEY]] as const)
      )
    }
  }

  const byRecord = new Map<RecordId, readonly SectionKey[]>()
  const idsByKey = new Map<SectionKey, RecordId[]>()
  const fieldIndex = input.index.group.fields.get(input.view.group.field)

  input.query.visible.forEach(recordId => {
    const keys = fieldIndex?.recordBuckets.get(recordId) ?? []
    byRecord.set(recordId, keys)
    keys.forEach(key => {
      const ids = idsByKey.get(key) ?? []
      if (!idsByKey.has(key)) {
        idsByKey.set(key, ids)
      }
      ids.push(recordId)
    })
  })

  const descriptors = buildGroupedDescriptors({
    document: input.document,
    view: input.view,
    index: input.index,
    idsByKey
  })

  const byKey = new Map<SectionKey, SectionNodeState>()
  descriptors.order.forEach(key => {
    const bucket = descriptors.byKey.get(key)
    const ids = idsByKey.get(key) ?? []
    const nextNode: SectionNodeState = {
      key,
      title: bucket?.title ?? key,
      color: bucket?.color,
      ...(bucket
        ? {
            bucket: {
              key: bucket.key as SectionKey,
              title: bucket.title,
              value: bucket.value,
              clearValue: bucket.clearValue,
              empty: bucket.empty,
              color: bucket.color
            }
          }
        : {}),
      ids,
      visible: visibleOf(ids, input.view.group, key),
      collapsed: collapsedOf(input.view.group, key)
    }
    const previousNode = input.previous?.byKey.get(key)
    byKey.set(key, previousNode && sameNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  const previous = input.previous
  const order = previous && sameIds(previous.order, descriptors.order)
    ? previous.order
    : descriptors.order

  return {
    order,
    byKey,
    byRecord
  }
}

export const syncSectionState = (input: {
  previous?: SectionState
  previousQuery?: QueryState
  document: DataDoc
  view: View
  query: QueryState
  index: IndexState
  touchedRecords: ReadonlySet<RecordId> | 'all'
  action: 'reuse' | 'sync' | 'rebuild'
}): SectionState => {
  if (input.action === 'reuse' && input.previous) {
    return input.previous
  }

  if (
    !input.previous
    || !input.previousQuery
    || input.action === 'rebuild'
    || input.touchedRecords === 'all'
    || input.previousQuery.visible !== input.query.visible
    || input.previousQuery.ordered !== input.query.ordered
  ) {
    return buildFromScratch({
      document: input.document,
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  if (!input.view.group) {
    return buildFromScratch({
      document: input.document,
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  const previous = input.previous
  const idsByKey = new Map(
    Array.from(previous.byKey.entries(), ([key, node]) => [
      key,
      [...node.ids]
    ] as const)
  )
  const byRecord = new Map(previous.byRecord)

  input.touchedRecords.forEach(recordId => {
    const before = previous.byRecord.get(recordId) ?? []
    const after = resolveSectionKeys({
      recordId,
      query: input.query,
      view: input.view,
      index: input.index
    })

    if (sameIds(before, after)) {
      return
    }

    before.forEach(key => {
      idsByKey.set(key, removeId(idsByKey.get(key) ?? [], recordId))
    })
    after.forEach(key => {
      idsByKey.set(key, insertOrdered(idsByKey.get(key) ?? [], recordId, input.query.order))
    })

    if (after.length) {
      byRecord.set(recordId, after)
      return
    }

    byRecord.delete(recordId)
  })

  const descriptors = buildGroupedDescriptors({
    document: input.document,
    view: input.view,
    index: input.index,
    idsByKey
  })

  const byKey = new Map<SectionKey, SectionNodeState>()
  descriptors.order.forEach(key => {
    const bucket = descriptors.byKey.get(key)
    const ids = idsByKey.get(key) ?? []
    const nextNode: SectionNodeState = {
      key,
      title: bucket?.title ?? key,
      color: bucket?.color,
      ...(bucket
        ? {
            bucket: {
              key: bucket.key as SectionKey,
              title: bucket.title,
              value: bucket.value,
              clearValue: bucket.clearValue,
              empty: bucket.empty,
              color: bucket.color
            }
          }
        : {}),
      ids,
      visible: visibleOf(ids, input.view.group, key),
      collapsed: collapsedOf(input.view.group, key)
    }
    const previousNode = previous.byKey.get(key)
    byKey.set(key, previousNode && sameNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  const order = sameIds(previous.order, descriptors.order)
    ? previous.order
    : descriptors.order

  return {
    order,
    byKey,
    byRecord
  }
}

export const toPublishedSections = (input: {
  sections: SectionState
  appearances: AppearanceList
  previous?: readonly Section[]
}): readonly Section[] => {
  const previousByKey = new Map(
    (input.previous ?? []).map(section => [section.key, section] as const)
  )

  return input.sections.order.flatMap(key => {
  const node = input.sections.byKey.get(key)
  if (!node || !node.visible) {
    return []
  }

  const ids = input.appearances.idsIn(node.key)
  const nextSection = {
    key: node.key,
    title: node.title,
    color: node.color,
    bucket: node.bucket,
    ids,
    collapsed: node.collapsed
  } satisfies Section
  const previousSection = previousByKey.get(node.key)

  return previousSection
    && previousSection.title === nextSection.title
    && previousSection.color === nextSection.color
    && previousSection.collapsed === nextSection.collapsed
    && previousSection.bucket?.key === nextSection.bucket?.key
    && previousSection.bucket?.title === nextSection.bucket?.title
    && previousSection.bucket?.value === nextSection.bucket?.value
    && previousSection.bucket?.clearValue === nextSection.bucket?.clearValue
    && previousSection.bucket?.empty === nextSection.bucket?.empty
    && previousSection.bucket?.color === nextSection.bucket?.color
    && sameIds(previousSection.ids, ids)
    ? [previousSection]
    : [nextSection]
  })
}
