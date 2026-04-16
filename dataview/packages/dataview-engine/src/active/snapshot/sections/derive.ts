import type {
  RecordId,
  View,
  ViewGroup
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import {
  readSectionGroupIndex
} from '@dataview/engine/active/index/group/demand'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  createSectionMembershipResolver,
  projectRecordIdsBySection,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
import type {
  SectionKey
} from '@dataview/engine/contracts/public'
import type {
  QueryState,
  SectionState
} from '@dataview/engine/contracts/internal'
import {
  readQueryVisibleSet
} from '@dataview/engine/contracts/internal'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]

const sameBucket = (
  left: import('@dataview/engine/contracts/internal').SectionNodeState['bucket'],
  right: import('@dataview/engine/contracts/internal').SectionNodeState['bucket']
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
  left: import('@dataview/engine/contracts/internal').SectionNodeState,
  right: import('@dataview/engine/contracts/internal').SectionNodeState
) => left.key === right.key
  && left.title === right.title
  && left.color === right.color
  && left.visible === right.visible
  && left.collapsed === right.collapsed
  && sameOrder(left.recordIds, right.recordIds)
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
}): import('@dataview/engine/contracts/internal').SectionNodeState => {
  const bucket = input.group
    ? readSectionGroupIndex(input.index.group, input.group)?.buckets.get(input.key)
    : undefined

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
    return ROOT_SECTION_KEYS
  }

  return readSectionGroupIndex(input.index.group, group)?.recordSections.get(input.recordId) ?? []
}

export const buildSectionState = (input: {
  view: View
  query: QueryState
  index: IndexState
  previous?: SectionState
}): SectionState => {
  if (!input.view.group) {
    const root = {
      key: ROOT_SECTION_KEY,
      title: 'All',
      recordIds: input.query.records.visible,
      visible: true,
      collapsed: false
    }
    const previousRoot = input.previous?.byKey.get(ROOT_SECTION_KEY)

    return {
      order: ROOT_SECTION_ORDER,
      byKey: new Map([
        [ROOT_SECTION_KEY, previousRoot && sameSectionNode(previousRoot, root) ? previousRoot : root] as const
      ])
    }
  }

  const groupIndex = readSectionGroupIndex(input.index.group, input.view.group)
  const useGroupProjection = input.query.records.visible === input.index.records.ids
  const idsByKey = useGroupProjection
    ? groupIndex?.sectionRecords ?? new Map<SectionKey, readonly RecordId[]>()
    : projectRecordIdsBySection({
        recordIds: input.query.records.visible,
        resolver: createSectionMembershipResolver({
          query: input.query,
          view: input.view,
          sectionGroup: groupIndex
        })
      })
  const order = groupIndex?.order ?? []
  const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()

  order.forEach(key => {
    const ids = idsByKey.get(key) ?? EMPTY_RECORD_IDS
    const nextNode = buildSectionNode({
      key,
      recordIds: ids,
      group: input.view.group,
      index: input.index
    })
    const previousNode = input.previous?.byKey.get(key)
    byKey.set(key, previousNode && sameSectionNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  return {
    order: input.previous && sameOrder(input.previous.order, order)
      ? input.previous.order
      : order,
    byKey
  }
}

export {
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
