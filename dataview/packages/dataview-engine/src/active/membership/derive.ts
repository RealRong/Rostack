import type {
  RecordId,
  View
} from '@dataview/core/types'
import type { Bucket } from '@dataview/core/field'
import { equal } from '@shared/core'
import {
  buildBucketViewState,
  bucket,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  createPartition,
  readPartitionSelections,
  readPartitionKeysById,
  type Partition
} from '@dataview/engine/active/shared/partition'
import {
  createMapDraft as createMapPatchBuilder
} from '@shared/draft'
import {
  createSelection,
  readSelectionIdSet,
  type Selection
} from '@dataview/engine/active/shared/selection'
import {
  EMPTY_SECTION_KEYS,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
import type {
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  MembershipMetaState,
  MembershipRecordChange,
  MembershipPhaseState as MembershipState,
  QueryPhaseDelta as QueryDelta,
  QueryPhaseState as QueryState
} from '@dataview/engine/active/state'
import type {
  DataviewMutationChange
} from '@dataview/core/mutation'
import {
  tokenRef
} from '@shared/i18n'

const EMPTY_INDEXES = [] as readonly number[]
const EMPTY_KEYS_BY_RECORD = new Map<RecordId, readonly SectionId[]>()
const EMPTY_RECORD_CHANGES = new Map<RecordId, MembershipRecordChange>()
const MAX_INCREMENTAL_SECTION_TOUCH_RATIO = 0.25
const MIN_LARGE_SECTION_TOUCH_COUNT = 1024
const ROOT_SECTION_LABEL = tokenRef('dataview.systemValue', 'section.all')

const sameBucket = (
  left: MembershipMetaState['bucket'],
  right: MembershipMetaState['bucket']
) => {
  if (!left || !right) {
    return left === right
  }

  return left.id === right.id
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
  order: readonly SectionId[]
  indexesByKey: ReadonlyMap<SectionId, readonly number[]>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionId[]>
  previous?: Partition<SectionId>
}): Partition<SectionId> => {
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

  previousSelections?.forEach((_selection, sectionId) => {
    if (!nextOrder.has(sectionId as SectionId)) {
      byKey!.delete(sectionId as SectionId)
    }
  })

  const createdSelections = new Map<SectionId, Selection>()
  order.forEach(sectionId => {
    const selection = createSelection({
      rows: input.rows,
      indexes: input.indexesByKey.get(sectionId) ?? EMPTY_INDEXES,
      previous: input.previous?.get(sectionId)
    })
    if (byKey) {
      byKey.set(sectionId, selection)
      return
    }

    createdSelections.set(sectionId, selection)
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
  order: readonly SectionId[]
  keysByRecord?: ReadonlyMap<RecordId, readonly SectionId[]>
  previous?: Partition<SectionId>
}): {
  keysByRecord: ReadonlyMap<RecordId, readonly SectionId[]>
  sections: Partition<SectionId>
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
  let visibleKeysByRecord: Map<RecordId, readonly SectionId[]> | undefined
  const indexesByKey = new Map<SectionId, number[]>()
  const visibleIds = input.visible.ids
  const visibleIndexes = input.visible.indexes
  const rows = input.visible.rows
  const keysByRecord = input.keysByRecord

  for (let offset = 0; offset < visibleIds.length; offset += 1) {
    const recordId = visibleIds[offset]!
    const keys = keysByRecord.get(recordId)
    if (!keys?.length) {
      continue
    }

    if (!fullVisible) {
      visibleKeysByRecord ??= new Map<RecordId, readonly SectionId[]>()
      visibleKeysByRecord.set(recordId, keys)
    }

    const rowIndex = fullVisible
      ? offset
      : visibleIndexes[offset]!
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const sectionId = keys[keyIndex]!
      const existing = indexesByKey.get(sectionId)
      if (existing) {
        existing.push(rowIndex)
        continue
      }

      indexesByKey.set(sectionId, [rowIndex])
    }
  }

  const nextKeysByRecord = fullVisible
    ? keysByRecord
    : visibleKeysByRecord?.size
      ? visibleKeysByRecord!
      : EMPTY_KEYS_BY_RECORD

  return {
    keysByRecord: nextKeysByRecord,
    sections: buildSectionPartition({
      rows,
      order: input.order,
      indexesByKey,
      keysByRecord: nextKeysByRecord,
      previous: input.previous
    })
  }
}

const buildMetaMap = (input: {
  order: readonly SectionId[]
  buckets?: ReadonlyMap<SectionId, Bucket>
  previous?: ReadonlyMap<SectionId, MembershipMetaState>
}): ReadonlyMap<SectionId, MembershipMetaState> => {
  const next = new Map<SectionId, MembershipMetaState>()
  let changed = !equal.sameOrder(input.previous ? [...input.previous.keys()] : [], input.order)

  input.order.forEach(sectionId => {
    const bucket = input.buckets?.get(sectionId)
    const created: MembershipMetaState = {
      label: bucket?.label ?? sectionId,
      ...(bucket?.color
        ? {
            color: bucket.color
          }
        : {}),
      ...(bucket
        ? {
            bucket: {
              id: bucket.key as SectionId,
              label: bucket.label,
              value: bucket.value,
              clearValue: bucket.clearValue,
              empty: bucket.empty,
              color: bucket.color
            }
          }
        : {})
    }
    const previousMeta = input.previous?.get(sectionId)
    const published = sameMeta(previousMeta, created)
      ? previousMeta!
      : created
    if (published !== previousMeta) {
      changed = true
    }
    next.set(sectionId, published)
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
        const next = new Map<RecordId, readonly SectionId[]>()
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
  keysByRecord?: ReadonlyMap<RecordId, readonly SectionId[]>
  previous?: MembershipState
}): MembershipState => {
  if (!input.view.group) {
    return buildRootMembershipState(input.query, input.previous)
  }

  const bucketSpec = bucket.normalize(input.view.group)
  const bucketIndex = readBucketIndex(input.index.bucket, bucketSpec)
  const presentation = buildBucketViewState({
    field: bucketIndex?.field,
    spec: bucketSpec,
    sort: input.view.group.bucketSort,
    values: input.index.records.values.get(input.view.group.fieldId)?.byRecord,
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
      buckets: presentation.buckets as ReadonlyMap<SectionId, Bucket>,
      previous: input.previous?.meta
    })
  }
}

export const readMembershipKeysByRecord = (
  membership: MembershipState
): ReadonlyMap<RecordId, readonly SectionId[]> => readPartitionKeysById(membership.sections)

const addChangedRecordIds = (
  target: Set<RecordId>,
  values?: readonly RecordId[]
) => {
  values?.forEach(recordId => {
    target.add(recordId)
  })
}

const sameSectionIds = (
  left: readonly string[],
  right: readonly string[]
) => equal.sameOrder(left, right)

const resolveChangedRecordIds = (input: {
  change: DataviewMutationChange
  queryDelta: QueryDelta
  bucketDelta?: IndexDelta['bucket']
}): ReadonlySet<RecordId> | 'all' => {
  const touchedRecords = input.change.record.touchedIds()
  if (touchedRecords === 'all') {
    return 'all'
  }

  const changed = new Set<RecordId>()
  addChangedRecordIds(changed, input.queryDelta.added)
  addChangedRecordIds(changed, input.queryDelta.removed)
  input.bucketDelta?.records.forEach((_record, recordId) => {
    changed.add(recordId)
  })
  return changed
}

const shouldRebuildGroupedSections = (input: {
  previous: MembershipState
  query: QueryState
  changedRecordIds: ReadonlySet<RecordId>
}): boolean => {
  const touchedCount = input.changedRecordIds.size
  if (touchedCount < MIN_LARGE_SECTION_TOUCH_COUNT) {
    return false
  }

  const baseline = Math.max(
    readMembershipKeysByRecord(input.previous).size,
    input.query.visible.read.count()
  )

  return touchedCount > baseline * MAX_INCREMENTAL_SECTION_TOUCH_RATIO
}

const buildRecordChanges = (input: {
  previous: MembershipState
  query: QueryState
  bucketKeysByRecord: ReadonlyMap<RecordId, readonly string[]>
  changedRecordIds: ReadonlySet<RecordId>
}): {
  keysByRecord: ReadonlyMap<RecordId, readonly string[]>
  records: ReadonlyMap<RecordId, MembershipRecordChange>
} => {
  const previousKeysByRecord = readMembershipKeysByRecord(input.previous)
  const fullVisible = input.query.visible.ids === input.query.visible.rows.ids
  const visible = fullVisible
    ? undefined
    : readSelectionIdSet(input.query.visible)
  const keysPatch = fullVisible
    ? undefined
    : createMapPatchBuilder(previousKeysByRecord)
  const records = new Map<RecordId, MembershipRecordChange>()

  input.changedRecordIds.forEach(recordId => {
    const before = previousKeysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const after = fullVisible
      ? input.bucketKeysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS
      : visible!.has(recordId)
        ? input.bucketKeysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS
        : EMPTY_SECTION_KEYS

    if (sameSectionIds(before, after)) {
      return
    }

    records.set(recordId, {
      before,
      after
    })

    if (fullVisible) {
      return
    }

    if (after.length) {
      keysPatch!.set(recordId, after)
      return
    }

    keysPatch!.delete(recordId)
  })

  return {
    keysByRecord: fullVisible
      ? input.bucketKeysByRecord
      : keysPatch!.changed()
        ? keysPatch!.finish()
        : previousKeysByRecord,
    records: records.size
      ? records
      : EMPTY_RECORD_CHANGES
  }
}

export const syncMembershipState = (input: {
  previous?: MembershipState
  view: View
  change: DataviewMutationChange
  query: QueryState
  queryDelta: QueryDelta
  index: IndexState
  indexDelta?: IndexDelta
  action: 'reuse' | 'sync' | 'rebuild'
}): {
  state: MembershipState
  records: ReadonlyMap<RecordId, MembershipRecordChange>
} => {
  if (input.action === 'reuse' && input.previous) {
    return {
      state: input.previous,
      records: EMPTY_RECORD_CHANGES
    }
  }

  if (
    !input.previous
    || input.action === 'rebuild'
  ) {
    return {
      state: buildMembershipState({
        view: input.view,
        query: input.query,
        index: input.index,
        previous: input.previous
      }),
      records: EMPTY_RECORD_CHANGES
    }
  }

  if (!input.view.group) {
    const records = new Map<RecordId, MembershipRecordChange>()
    input.queryDelta.removed.forEach(recordId => {
      records.set(recordId, {
        before: ROOT_SECTION_KEYS,
        after: EMPTY_SECTION_KEYS
      })
    })
    input.queryDelta.added.forEach(recordId => {
      records.set(recordId, {
        before: EMPTY_SECTION_KEYS,
        after: ROOT_SECTION_KEYS
      })
    })

    const state = buildMembershipState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })

    return {
      state,
      records: records.size
        ? records
        : EMPTY_RECORD_CHANGES
    }
  }

  const bucketIndex = readBucketIndex(input.index.bucket, bucket.normalize(input.view.group))
  const changedRecordIds = resolveChangedRecordIds({
    change: input.change,
    queryDelta: input.queryDelta,
    bucketDelta: input.indexDelta?.bucket
  })
  if (
    !bucketIndex
    || input.indexDelta?.bucket?.rebuild
    || changedRecordIds === 'all'
  ) {
    return {
      state: buildMembershipState({
        view: input.view,
        query: input.query,
        index: input.index,
        previous: input.previous
      }),
      records: EMPTY_RECORD_CHANGES
    }
  }

  if (shouldRebuildGroupedSections({
    previous: input.previous,
    query: input.query,
    changedRecordIds
  })) {
    return {
      state: buildMembershipState({
        view: input.view,
        query: input.query,
        index: input.index,
        previous: input.previous
      }),
      records: EMPTY_RECORD_CHANGES
    }
  }

  const changed = buildRecordChanges({
    previous: input.previous,
    query: input.query,
    bucketKeysByRecord: bucketIndex.keysByRecord,
    changedRecordIds
  })

  return {
    state: buildMembershipState({
      view: input.view,
      query: input.query,
      index: input.index,
      keysByRecord: changed.keysByRecord,
      previous: input.previous
    }),
    records: changed.records
  }
}

export {
  EMPTY_SECTION_KEYS,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER
} from '@dataview/engine/active/shared/sections'
