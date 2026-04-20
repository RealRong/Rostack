import type {
  RecordId,
  View,
  ViewGroup
} from '@dataview/core/contracts'
import type { Bucket } from '@dataview/core/field'
import {
  sameJsonValue,
  sameOrder
} from '@shared/core'
import {
  buildBucketViewState,
  createBucketSpec,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  buildSectionMembership,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
import type {
  SectionKey
} from '@dataview/engine/contracts/public'
import type {
  QueryState,
  SectionNodeState,
  SectionState
} from '@dataview/engine/contracts/internal'
import {
  tokenRef
} from '@shared/i18n'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_KEYS_BY_RECORD = new Map<RecordId, readonly SectionKey[]>()
const EMPTY_RECORD_IDS_BY_SECTION = new Map<SectionKey, readonly RecordId[]>()
const ROOT_SECTION_LABEL = tokenRef('dataview.systemValue', 'section.all')

const sameBucket = (
  left: SectionNodeState['bucket'],
  right: SectionNodeState['bucket']
) => {
  if (!left || !right) {
    return left === right
  }

  return left.key === right.key
    && sameJsonValue(left.label, right.label)
    && left.value === right.value
    && left.clearValue === right.clearValue
    && left.empty === right.empty
    && left.color === right.color
}

export const sameSectionNode = (
  left: SectionNodeState,
  right: SectionNodeState
) => left.key === right.key
  && sameJsonValue(left.label, right.label)
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

const readSectionBucketState = (input: {
  group: ViewGroup | undefined
  index: IndexState
}) => input.group
  ? readBucketIndex(input.index.bucket, createBucketSpec(input.group))
  : undefined

export const buildSectionNode = (input: {
  key: SectionKey
  recordIds: readonly RecordId[]
  group: ViewGroup | undefined
  index: IndexState
  buckets?: ReadonlyMap<SectionKey, Bucket>
}): SectionNodeState => {
  const bucket = input.buckets?.get(input.key)

  return {
    key: input.key,
    label: bucket?.label ?? input.key,
    color: bucket?.color,
    ...(bucket
      ? {
          bucket: {
            key: bucket.key as SectionKey,
            label: bucket.label,
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

const buildRootSectionState = (
  query: QueryState,
  previous?: SectionState
): SectionState => {
  const root = {
    key: ROOT_SECTION_KEY,
    label: ROOT_SECTION_LABEL,
    recordIds: query.records.visible,
    visible: true,
    collapsed: false
  }
  const previousRoot = previous?.byKey.get(ROOT_SECTION_KEY)
  const keysByRecord = new Map<RecordId, readonly SectionKey[]>(
    query.records.visible.map(recordId => [recordId, ROOT_SECTION_KEYS] as const)
  )

  return {
    order: ROOT_SECTION_ORDER,
    byKey: new Map([
      [ROOT_SECTION_KEY, previousRoot && sameSectionNode(previousRoot, root) ? previousRoot : root] as const
    ]),
    keysByRecord: previous && previous.keysByRecord.size === keysByRecord.size
      && query.records.visible === previous.byKey.get(ROOT_SECTION_KEY)?.recordIds
      ? previous.keysByRecord
      : keysByRecord
  }
}

export const buildSectionState = (input: {
  view: View
  query: QueryState
  index: IndexState
  previous?: SectionState
}): SectionState => {
  if (!input.view.group) {
    return buildRootSectionState(input.query, input.previous)
  }

  const bucketIndex = readSectionBucketState({
    group: input.view.group,
    index: input.index
  })
  const fullVisible = input.query.records.visible === input.index.records.ids
  const sectionMembership = fullVisible
    ? undefined
    : buildSectionMembership({
        recordIds: input.query.records.visible,
        keysByRecord: bucketIndex?.keysByRecord
      })
  const keysByRecord = fullVisible
    ? bucketIndex?.keysByRecord ?? EMPTY_KEYS_BY_RECORD
    : sectionMembership?.keysByRecord ?? EMPTY_KEYS_BY_RECORD
  const recordIdsBySection = fullVisible
    ? bucketIndex?.recordsByKey ?? EMPTY_RECORD_IDS_BY_SECTION
    : sectionMembership?.recordIdsBySection ?? EMPTY_RECORD_IDS_BY_SECTION
  const sectionField = input.index.records.values.get(input.view.group.field)?.byRecord
  const presentation = buildBucketViewState({
    field: bucketIndex?.field,
    spec: createBucketSpec(input.view.group),
    sort: input.view.group.bucketSort,
    values: sectionField,
    recordsByKey: bucketIndex?.recordsByKey ?? new Map(),
    previous: undefined
  })
  const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()

  presentation.order.forEach(key => {
    const ids = recordIdsBySection.get(key) ?? EMPTY_RECORD_IDS
    const nextNode = buildSectionNode({
      key,
      recordIds: ids,
      group: input.view.group,
      index: input.index,
      buckets: presentation.buckets as ReadonlyMap<SectionKey, Bucket>
    })
    const previousNode = input.previous?.byKey.get(key)
    byKey.set(key, previousNode && sameSectionNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  return {
    order: input.previous && sameOrder(input.previous.order, presentation.order)
      ? input.previous.order
      : presentation.order,
    byKey,
    keysByRecord
  }
}

export {
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
