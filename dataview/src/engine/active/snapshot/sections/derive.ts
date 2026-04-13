import type {
  RecordId,
  ViewGroup,
  View
} from '@dataview/core/contracts'
import { sameOrder } from '@shared/core'
import {
  readGroupFieldIndex
} from '../../index/group/demand'
import type {
  IndexState
} from '../../index/types'
import type {
  SectionKey
} from '../../../contracts/public'
import type {
  QueryState,
  SectionState
} from '../../../contracts/internal'
import { createItemId } from './publish'
import {
  readQueryVisibleSet
} from '../../../contracts/internal'

export const ROOT_SECTION_KEY = 'root' as SectionKey

export const sameRecordIds = (
  left: readonly RecordId[],
  right: readonly RecordId[]
) => sameOrder(left, right)

const sameBucket = (
  left: import('../../../contracts/internal').SectionNodeState['bucket'],
  right: import('../../../contracts/internal').SectionNodeState['bucket']
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

export const sameSectionNode = (
  left: import('../../../contracts/internal').SectionNodeState,
  right: import('../../../contracts/internal').SectionNodeState
) => left.key === right.key
  && left.title === right.title
  && left.color === right.color
  && left.visible === right.visible
  && left.collapsed === right.collapsed
  && sameRecordIds(left.recordIds, right.recordIds)
  && sameBucket(left.bucket, right.bucket)

const visibleOf = (
  recordIds: readonly RecordId[],
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

  return group.showEmpty !== false || recordIds.length > 0
}

const collapsedOf = (
  group: ViewGroup | undefined,
  sectionKey: SectionKey
) => group?.buckets?.[sectionKey]?.collapsed === true

export const buildSectionNode = (input: {
  key: SectionKey
  recordIds: readonly RecordId[]
  group: ViewGroup | undefined
  index: IndexState
  previous?: import('../../../contracts/internal').SectionNodeState
}): import('../../../contracts/internal').SectionNodeState => {
  const bucket = input.group
    ? readGroupFieldIndex(input.index.group, input.group)?.buckets.get(input.key)
    : undefined
  const itemIds = input.previous && sameRecordIds(input.previous.recordIds, input.recordIds)
    ? input.previous.itemIds
    : input.recordIds.map(recordId => createItemId({
        section: input.key,
        recordId
      }))

  return {
    key: input.key,
    title: bucket?.title ?? input.key,
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
    recordIds: input.recordIds,
    itemIds,
    visible: visibleOf(input.recordIds, input.group, input.key),
    collapsed: collapsedOf(input.group, input.key)
  }
}

export const resolveSectionKeys = (input: {
  recordId: RecordId
  query: QueryState
  view: View
  index: IndexState
}): readonly SectionKey[] => {
  if (!readQueryVisibleSet(input.query).has(input.recordId)) {
    return []
  }

  const group = input.view.group
  if (!group) {
    return [ROOT_SECTION_KEY]
  }

  return readGroupFieldIndex(input.index.group, group)?.recordBuckets.get(input.recordId) ?? []
}

export const buildSectionState = (input: {
  view: View
  query: QueryState
  index: IndexState
  previous?: SectionState
}): SectionState => {
  if (!input.view.group) {
    const previousRoot = input.previous?.byKey.get(ROOT_SECTION_KEY)
    const root = {
      key: ROOT_SECTION_KEY,
      title: 'All',
      recordIds: input.query.visible,
      itemIds: previousRoot && sameRecordIds(previousRoot.recordIds, input.query.visible)
        ? previousRoot.itemIds
        : input.query.visible.map(recordId => createItemId({
            section: ROOT_SECTION_KEY,
            recordId
          })),
      visible: true,
      collapsed: false
    }

    return {
      order: [ROOT_SECTION_KEY],
      byKey: new Map([
        [ROOT_SECTION_KEY, previousRoot && sameSectionNode(previousRoot, root) ? previousRoot : root] as const
      ]),
      byRecord: new Map(
        input.query.visible.map(recordId => [recordId, [ROOT_SECTION_KEY]] as const)
      )
    }
  }

  const groupIndex = readGroupFieldIndex(input.index.group, input.view.group)
  const byRecord = new Map<RecordId, readonly SectionKey[]>()
  const idsByKey = new Map<SectionKey, RecordId[]>()

  input.query.visible.forEach(recordId => {
    const keys = groupIndex?.recordBuckets.get(recordId) ?? []
    byRecord.set(recordId, keys)
    keys.forEach(key => {
      const ids = idsByKey.get(key) ?? []
      if (!idsByKey.has(key)) {
        idsByKey.set(key, ids)
      }
      ids.push(recordId)
    })
  })

  const order = groupIndex?.order ?? []
  const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()
  order.forEach(key => {
    const ids = idsByKey.get(key) ?? []
    const nextNode = buildSectionNode({
      key,
      recordIds: ids,
      group: input.view.group,
      index: input.index,
      previous: input.previous?.byKey.get(key)
    })
    const previousNode = input.previous?.byKey.get(key)
    byKey.set(key, previousNode && sameSectionNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  return {
    order: input.previous && sameRecordIds(input.previous.order, order)
      ? input.previous.order
      : order,
    byKey,
    byRecord
  }
}
