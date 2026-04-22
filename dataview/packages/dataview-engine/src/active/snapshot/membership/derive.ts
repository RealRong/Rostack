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
  createPartition,
  readPartitionSelections,
  readPartitionKeysById,
  type Partition
} from '@dataview/engine/active/shared/partition'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import {
  createSelection,
  type Selection
} from '@dataview/engine/active/shared/selection'
import {
  EMPTY_SECTION_KEYS,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
import type {
  SectionKey
} from '@dataview/engine/contracts'
import type {
  MembershipMetaState,
  MembershipState,
  QueryState
} from '@dataview/engine/contracts/state'
import {
  tokenRef
} from '@shared/i18n'

const EMPTY_INDEXES = [] as readonly number[]
const EMPTY_KEYS_BY_RECORD = new Map<RecordId, readonly SectionKey[]>()
const ROOT_SECTION_LABEL = tokenRef('dataview.systemValue', 'section.all')

const sameBucket = (
  left: MembershipMetaState['bucket'],
  right: MembershipMetaState['bucket']
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

const sameMeta = (
  left: MembershipMetaState | undefined,
  right: MembershipMetaState
) => Boolean(
  left
  && equal.sameJsonValue(left.label, right.label)
  && left.color === right.color
  && sameBucket(left.bucket, right.bucket)
)

const buildSectionPartition = (input: {
  rows: Selection['rows']
  order: readonly SectionKey[]
  indexesByKey: ReadonlyMap<SectionKey, readonly number[]>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
  previous?: Partition<SectionKey>
}): Partition<SectionKey> => {
  const order = input.previous && equal.sameOrder(input.previous.order, input.order)
    ? input.previous.order
    : input.order
  const previousSelections = input.previous
    ? readPartitionSelections(input.previous)
    : undefined
  const byKey = previousSelections
    ? createMapPatchBuilder(previousSelections)
    : undefined
  const nextOrder = new Set(order)

  previousSelections?.forEach((_selection, sectionKey) => {
    if (!nextOrder.has(sectionKey as SectionKey)) {
      byKey!.delete(sectionKey as SectionKey)
    }
  })

  const createdSelections = new Map<SectionKey, Selection>()
  order.forEach(sectionKey => {
    const selection = createSelection({
      rows: input.rows,
      indexes: input.indexesByKey.get(sectionKey) ?? EMPTY_INDEXES,
      previous: input.previous?.get(sectionKey)
    })
    if (byKey) {
      byKey.set(sectionKey, selection)
      return
    }

    createdSelections.set(sectionKey, selection)
  })

  return createPartition({
    order,
    byKey: byKey
      ? byKey.finish()
      : createdSelections,
    keysById: input.keysByRecord,
    previous: input.previous
  })
}

const buildGroupedSections = (input: {
  visible: Selection
  order: readonly SectionKey[]
  keysByRecord?: ReadonlyMap<RecordId, readonly SectionKey[]>
  previous?: Partition<SectionKey>
}): {
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
  sections: Partition<SectionKey>
} => {
  if (!input.visible.read.count() || !input.keysByRecord) {
    return {
      keysByRecord: EMPTY_KEYS_BY_RECORD,
      sections: buildSectionPartition({
        rows: input.visible.rows,
        order: input.order,
        indexesByKey: new Map(),
        keysByRecord: EMPTY_KEYS_BY_RECORD,
        previous: input.previous
      })
    }
  }

  const fullVisible = input.visible.ids === input.visible.rows.ids
  const visibleKeysByRecord = fullVisible
    ? undefined
    : new Map<RecordId, readonly SectionKey[]>()
  const indexesByKey = new Map<SectionKey, number[]>()

  for (let offset = 0; offset < input.visible.indexes.length; offset += 1) {
    const rowIndex = input.visible.indexes[offset]!
    const recordId = input.visible.rows.at(rowIndex)
    if (!recordId) {
      continue
    }

    const keys = input.keysByRecord.get(recordId)
    if (!keys?.length) {
      continue
    }

    if (!fullVisible) {
      visibleKeysByRecord!.set(recordId, keys)
    }

    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const sectionKey = keys[keyIndex]!
      const existing = indexesByKey.get(sectionKey)
      if (existing) {
        existing.push(rowIndex)
        continue
      }

      indexesByKey.set(sectionKey, [rowIndex])
    }
  }

  const keysByRecord = fullVisible
    ? input.keysByRecord
    : visibleKeysByRecord!.size
      ? visibleKeysByRecord!
      : EMPTY_KEYS_BY_RECORD

  return {
    keysByRecord,
    sections: buildSectionPartition({
      rows: input.visible.rows,
      order: input.order,
      indexesByKey,
      keysByRecord,
      previous: input.previous
    })
  }
}

const buildMetaMap = (input: {
  order: readonly SectionKey[]
  buckets?: ReadonlyMap<SectionKey, Bucket>
  previous?: ReadonlyMap<SectionKey, MembershipMetaState>
}): ReadonlyMap<SectionKey, MembershipMetaState> => {
  const next = new Map<SectionKey, MembershipMetaState>()
  let changed = !equal.sameOrder(input.previous ? [...input.previous.keys()] : [], input.order)

  input.order.forEach(sectionKey => {
    const bucket = input.buckets?.get(sectionKey)
    const created: MembershipMetaState = {
      label: bucket?.label ?? sectionKey,
      ...(bucket?.color
        ? {
            color: bucket.color
          }
        : {}),
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
        : {})
    }
    const previousMeta = input.previous?.get(sectionKey)
    const published = sameMeta(previousMeta, created)
      ? previousMeta!
      : created
    if (published !== previousMeta) {
      changed = true
    }
    next.set(sectionKey, published)
  })

  return !changed && input.previous
    ? input.previous
    : next
}

const buildRootMembershipState = (
  query: QueryState,
  previous?: MembershipState
): MembershipState => {
  const keysByRecord = query.visible.read.count()
    ? (() => {
        const next = new Map<RecordId, readonly SectionKey[]>()
        const visibleIds = query.visible.ids
        for (let index = 0; index < visibleIds.length; index += 1) {
          next.set(visibleIds[index]!, ROOT_SECTION_KEYS)
        }
        return next
      })()
    : EMPTY_KEYS_BY_RECORD
  const sections = buildSectionPartition({
    rows: query.visible.rows,
    order: ROOT_SECTION_ORDER,
    indexesByKey: new Map([
      [ROOT_SECTION_KEY, query.visible.indexes]
    ] as const),
    keysByRecord,
    previous: previous?.sections
  })
  const rootMeta = previous?.meta.get(ROOT_SECTION_KEY)
  const meta = rootMeta && rootMeta.label === ROOT_SECTION_LABEL
    ? previous!.meta
    : new Map([
        [ROOT_SECTION_KEY, {
          label: ROOT_SECTION_LABEL
        }]
      ] as const)

  return {
    sections,
    meta
  }
}

export const buildMembershipState = (input: {
  view: View
  query: QueryState
  index: IndexState
  keysByRecord?: ReadonlyMap<RecordId, readonly SectionKey[]>
  previous?: MembershipState
}): MembershipState => {
  if (!input.view.group) {
    return buildRootMembershipState(input.query, input.previous)
  }

  const bucketIndex = readBucketIndex(input.index.bucket, createBucketSpec(input.view.group))
  const presentation = buildBucketViewState({
    field: bucketIndex?.field,
    spec: createBucketSpec(input.view.group),
    sort: input.view.group.bucketSort,
    values: input.index.records.values.get(input.view.group.field)?.byRecord,
    recordsByKey: bucketIndex?.recordsByKey ?? new Map(),
    previous: undefined
  })
  const grouped = buildGroupedSections({
    visible: input.query.visible,
    order: presentation.order,
    keysByRecord: input.keysByRecord ?? bucketIndex?.keysByRecord,
    previous: input.previous?.sections
  })

  return {
    sections: grouped.sections,
    meta: buildMetaMap({
      order: presentation.order,
      buckets: presentation.buckets as ReadonlyMap<SectionKey, Bucket>,
      previous: input.previous?.meta
    })
  }
}

export const readMembershipKeysByRecord = (
  membership: MembershipState
): ReadonlyMap<RecordId, readonly SectionKey[]> => readPartitionKeysById(membership.sections)

export {
  EMPTY_SECTION_KEYS,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
