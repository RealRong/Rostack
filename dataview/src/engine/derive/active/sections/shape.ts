import type {
  RecordId,
  ViewGroup
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import type {
  IndexState
} from '../../../index/types'
import {
  readGroupFieldIndex
} from '../../../index/group'
import type {
  SectionKey
} from '../../../contracts/public'
import type {
  SectionNodeState,
  SectionState
} from '../../../contracts/internal'

export const ROOT_SECTION_KEY = 'root' as SectionKey

export const sameRecordIds = (
  left: readonly RecordId[],
  right: readonly RecordId[]
) => sameOrder(left, right)

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

export const sameSectionNode = (
  left: SectionNodeState,
  right: SectionNodeState
) => left.key === right.key
  && left.title === right.title
  && left.color === right.color
  && left.visible === right.visible
  && left.collapsed === right.collapsed
  && sameRecordIds(left.recordIds, right.recordIds)
  && sameBucket(left.bucket, right.bucket)

export const visibleOf = (
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

export const collapsedOf = (
  group: ViewGroup | undefined,
  sectionKey: SectionKey
) => group?.buckets?.[sectionKey]?.collapsed === true

export const buildSectionNode = (input: {
  key: SectionKey
  recordIds: readonly RecordId[]
  group: ViewGroup | undefined
  index: IndexState
}): SectionNodeState => {
  const bucket = input.group
    ? readGroupFieldIndex(input.index.group, input.group)?.buckets.get(input.key)
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

export const emptySectionState = (): SectionState => ({
  order: [],
  byKey: new Map(),
  byRecord: new Map()
})
