import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import type { Bucket } from '@dataview/core/field'
import { equal } from '@shared/core'
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
} from '@dataview/engine/contracts'
import type {
  MembershipNodeState,
  MembershipState,
  QueryState,
} from '@dataview/engine/contracts/state'
import {
  tokenRef
} from '@shared/i18n'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_RECORD_INDEXES = [] as readonly number[]
const EMPTY_KEYS_BY_RECORD = new Map<RecordId, readonly SectionKey[]>()
const EMPTY_RECORD_IDS_BY_SECTION = new Map<SectionKey, readonly RecordId[]>()
const EMPTY_RECORD_INDEXES_BY_SECTION = new Map<SectionKey, readonly number[]>()
const ROOT_SECTION_LABEL = tokenRef('dataview.systemValue', 'section.all')

const sameBucket = (
  left: MembershipNodeState['bucket'],
  right: MembershipNodeState['bucket']
) => {
  if (!left || !right) {
    return left === right
  }

  return left.key === right.key
    && equal.sameJsonValue(left.label, right.label)
    && left.value === right.value
    && left.clearValue === right.clearValue
    && left.empty === right.empty
    && left.color === right.color
}

export const sameMembershipNode = (
  left: MembershipNodeState,
  right: MembershipNodeState
) => left.key === right.key
  && equal.sameJsonValue(left.label, right.label)
  && left.color === right.color
  && equal.sameOrder(left.recordIds, right.recordIds)
  && equal.sameOrder(left.recordIndexes ?? EMPTY_RECORD_INDEXES, right.recordIndexes ?? EMPTY_RECORD_INDEXES)
  && sameBucket(left.bucket, right.bucket)

const buildRecordIndexes = (input: {
  recordIds: readonly RecordId[]
  order: ReadonlyMap<RecordId, number>
  fullOrder: boolean
}): readonly number[] => {
  if (!input.recordIds.length) {
    return EMPTY_RECORD_INDEXES
  }

  const indexes = new Array<number>(input.recordIds.length)
  for (let index = 0; index < input.recordIds.length; index += 1) {
    indexes[index] = input.fullOrder
      ? index
      : input.order.get(input.recordIds[index]!)!
  }

  return indexes
}

const readSectionBucketState = (input: {
  group: View['group']
  index: IndexState
}) => input.group
  ? readBucketIndex(input.index.bucket, createBucketSpec(input.group))
  : undefined

export const buildMembershipNode = (input: {
  key: SectionKey
  recordIds: readonly RecordId[]
  recordIndexes?: readonly number[]
  index: IndexState
  buckets?: ReadonlyMap<SectionKey, Bucket>
}): MembershipNodeState => {
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
    ...(input.recordIndexes?.length
      ? {
          recordIndexes: input.recordIndexes
        }
      : {})
  }
}

const buildRootMembershipState = (
  index: IndexState,
  query: QueryState,
  previous?: MembershipState
): MembershipState => {
  const fullVisible = query.records.visible === index.records.ids
  const root = {
    key: ROOT_SECTION_KEY,
    label: ROOT_SECTION_LABEL,
    recordIds: query.records.visible,
    recordIndexes: buildRecordIndexes({
      recordIds: query.records.visible,
      order: index.records.order,
      fullOrder: fullVisible
    })
  }
  const previousRoot = previous?.byKey.get(ROOT_SECTION_KEY)
  const keysByRecord = new Map<RecordId, readonly SectionKey[]>(
    query.records.visible.map(recordId => [recordId, ROOT_SECTION_KEYS] as const)
  )

  return {
    order: ROOT_SECTION_ORDER,
    byKey: new Map([
      [ROOT_SECTION_KEY, previousRoot && sameMembershipNode(previousRoot, root) ? previousRoot : root] as const
    ]),
    keysByRecord: previous && previous.keysByRecord.size === keysByRecord.size
      && query.records.visible === previous.byKey.get(ROOT_SECTION_KEY)?.recordIds
      ? previous.keysByRecord
      : keysByRecord
  }
}

export const buildMembershipState = (input: {
  view: View
  query: QueryState
  index: IndexState
  previous?: MembershipState
}): MembershipState => {
  if (!input.view.group) {
    return buildRootMembershipState(input.index, input.query, input.previous)
  }

  const bucketIndex = readSectionBucketState({
    group: input.view.group,
    index: input.index
  })
  const fullVisible = input.query.records.visible === input.index.records.ids
  const sectionMembership = buildSectionMembership({
    recordIds: input.query.records.visible,
    keysByRecord: bucketIndex?.keysByRecord,
    order: input.index.records.order,
    fullOrder: fullVisible
  })
  const keysByRecord = fullVisible
    ? bucketIndex?.keysByRecord ?? EMPTY_KEYS_BY_RECORD
    : sectionMembership.keysByRecord
  const recordIdsBySection = sectionMembership.recordIdsBySection.size
    ? sectionMembership.recordIdsBySection
    : (fullVisible ? bucketIndex?.recordsByKey ?? EMPTY_RECORD_IDS_BY_SECTION : EMPTY_RECORD_IDS_BY_SECTION)
  const recordIndexesBySection = sectionMembership.recordIndexesBySection.size
    ? sectionMembership.recordIndexesBySection
    : EMPTY_RECORD_INDEXES_BY_SECTION
  const sectionField = input.index.records.values.get(input.view.group.field)?.byRecord
  const presentation = buildBucketViewState({
    field: bucketIndex?.field,
    spec: createBucketSpec(input.view.group),
    sort: input.view.group.bucketSort,
    values: sectionField,
    recordsByKey: bucketIndex?.recordsByKey ?? new Map(),
    previous: undefined
  })
  const byKey = new Map<SectionKey, ReturnType<typeof buildMembershipNode>>()

  presentation.order.forEach(key => {
    const ids = recordIdsBySection.get(key) ?? EMPTY_RECORD_IDS
    const recordIndexes = recordIndexesBySection.get(key) ?? EMPTY_RECORD_INDEXES
    const nextNode = buildMembershipNode({
      key,
      recordIds: ids,
      recordIndexes,
      index: input.index,
      buckets: presentation.buckets as ReadonlyMap<SectionKey, Bucket>
    })
    const previousNode = input.previous?.byKey.get(key)
    byKey.set(key, previousNode && sameMembershipNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  return {
    order: input.previous && equal.sameOrder(input.previous.order, presentation.order)
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
