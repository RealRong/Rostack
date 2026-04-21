import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import type { Bucket } from '@dataview/core/field'
import { equal } from '@shared/core'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  buildBucketViewState,
  createBucketSpec,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
import {
  applyOrderedIdDelta
} from '@dataview/engine/active/shared/ordered'
import {
  membershipRead,
  type ActiveImpact
} from '@dataview/engine/active/shared/impact'
import {
  EMPTY_SECTION_KEYS,
  projectRecordIdsBySection,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER,
  sameSectionKeys
} from '@dataview/engine/active/shared/sections'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
  SectionKey
} from '@dataview/engine/contracts'
import type {
  QueryState,
  MembershipRecordChange,
  MembershipState
} from '@dataview/engine/contracts/state'
import {
  readQueryOrder,
  readQueryVisibleSet
} from '@dataview/engine/contracts/state'
import {
  buildMembershipNode,
  buildMembershipState,
  sameMembershipNode
} from '@dataview/engine/active/snapshot/membership/derive'
import {
  tokenRef
} from '@shared/i18n'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_RECORD_CHANGES = new Map<RecordId, MembershipRecordChange>()
const EMPTY_TOUCHED_SECTIONS = new Set<string>()
const ROOT_SECTION_LABEL = tokenRef('dataview.systemValue', 'section.all')
const MAX_INCREMENTAL_SECTION_TOUCH_RATIO = 0.25
const MIN_LARGE_SECTION_TOUCH_COUNT = 1024

const addChangedRecordIds = (
  target: Set<RecordId>,
  values?: readonly RecordId[]
) => {
  values?.forEach(recordId => {
    target.add(recordId)
  })
}

const createRecordIdSet = (
  ids?: readonly RecordId[]
): ReadonlySet<RecordId> | undefined => ids?.length
  ? new Set(ids)
  : undefined

const resolveChangedRecordIds = (
  impact: ActiveImpact
): ReadonlySet<RecordId> | 'all' => {
  if (impact.base.touchedRecords === 'all') {
    return 'all'
  }

  const changed = new Set<RecordId>()
  addChangedRecordIds(changed, impact.query?.visibleAdded)
  addChangedRecordIds(changed, impact.query?.visibleRemoved)
  membershipRead.records(impact.bucket)?.forEach((_record, recordId) => {
    changed.add(recordId)
  })
  return changed
}

const buildRootKeysByRecord = (
  recordIds: readonly RecordId[]
): ReadonlyMap<RecordId, readonly SectionKey[]> => new Map(
  recordIds.map(recordId => [recordId, ROOT_SECTION_KEYS] as const)
)

const syncRootMembershipState = (input: {
  previous: MembershipState
  query: QueryState
  impact: ActiveImpact
}): {
  state: MembershipState
  records: ReadonlyMap<RecordId, MembershipRecordChange>
} => {
  const previousRoot = input.previous.byKey.get(ROOT_SECTION_KEY)
  const records = new Map<RecordId, MembershipRecordChange>()
  const hasVisibleDelta = Boolean(
    input.impact.query?.visibleAdded.length
    || input.impact.query?.visibleRemoved.length
  )

  input.impact.query?.visibleRemoved.forEach(recordId => {
    records.set(recordId, {
      before: ROOT_SECTION_KEYS,
      after: EMPTY_SECTION_KEYS
    })
  })
  input.impact.query?.visibleAdded.forEach(recordId => {
    records.set(recordId, {
      before: EMPTY_SECTION_KEYS,
      after: ROOT_SECTION_KEYS
    })
  })

  const nextRoot = {
    key: ROOT_SECTION_KEY,
    label: ROOT_SECTION_LABEL,
    recordIds: input.query.records.visible
  }
  const publishedRoot = previousRoot && sameMembershipNode(previousRoot, nextRoot)
    ? previousRoot
    : nextRoot
  const keysByRecord = buildRootKeysByRecord(input.query.records.visible)

  if (
    publishedRoot === previousRoot
    && input.previous.order === ROOT_SECTION_ORDER
    && !hasVisibleDelta
    && input.previous.keysByRecord.size === keysByRecord.size
  ) {
    return {
      state: input.previous,
      records: EMPTY_RECORD_CHANGES
    }
  }

  return {
    state: {
      order: ROOT_SECTION_ORDER,
      byKey: new Map([
        [ROOT_SECTION_KEY, publishedRoot] as const
      ]),
      keysByRecord
    },
    records: records.size
      ? records
      : EMPTY_RECORD_CHANGES
  }
}

const buildVisibleKeysForRecord = (input: {
  visible: ReadonlySet<RecordId>
  bucketKeysByRecord?: ReadonlyMap<RecordId, readonly string[]>
  recordId: RecordId
}): readonly string[] => input.visible.has(input.recordId)
  ? input.bucketKeysByRecord?.get(input.recordId) ?? EMPTY_SECTION_KEYS
  : EMPTY_SECTION_KEYS

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
    input.previous.keysByRecord.size,
    input.query.records.visible.length
  )

  return touchedCount > baseline * MAX_INCREMENTAL_SECTION_TOUCH_RATIO
}

export const syncMembershipState = (input: {
  previous?: MembershipState
  view: View
  query: QueryState
  index: IndexState
  impact: ActiveImpact
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
    return syncRootMembershipState({
      previous: input.previous,
      query: input.query,
      impact: input.impact
    })
  }

  const previous = input.previous
  const bucketIndex = readBucketIndex(input.index.bucket, createBucketSpec(input.view.group))
  const changedRecordIds = resolveChangedRecordIds(input.impact)
  if (!bucketIndex || changedRecordIds === 'all') {
    return {
      state: buildMembershipState({
        view: input.view,
        query: input.query,
        index: input.index,
        previous
      }),
      records: EMPTY_RECORD_CHANGES
    }
  }

  if (shouldRebuildGroupedSections({
    previous,
    query: input.query,
    changedRecordIds
  })) {
    return {
      state: buildMembershipState({
        view: input.view,
        query: input.query,
        index: input.index,
        previous
      }),
      records: EMPTY_RECORD_CHANGES
    }
  }

  const fullVisible = input.query.records.visible === input.index.records.ids
  const visible = fullVisible
    ? undefined
    : readQueryVisibleSet(input.query)
  const recordChanges = new Map<RecordId, MembershipRecordChange>()
  const keysByRecord = fullVisible
    ? undefined
    : createMapPatchBuilder(previous.keysByRecord)
  let keysChanged = false

  changedRecordIds.forEach(recordId => {
    const before = previous.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const after = fullVisible
      ? bucketIndex.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS
      : buildVisibleKeysForRecord({
          visible: visible!,
          bucketKeysByRecord: bucketIndex.keysByRecord,
          recordId
        })
    if (sameSectionKeys(before, after)) {
      return
    }

    recordChanges.set(recordId, {
      before,
      after
    })
    keysChanged = true

    if (fullVisible) {
      return
    }

    if (after.length) {
      keysByRecord!.set(recordId, after)
      return
    }

    keysByRecord!.delete(recordId)
  })

  const nextKeysByRecord = fullVisible
    ? bucketIndex.keysByRecord
    : keysChanged
      ? keysByRecord!.finish()
    : previous.keysByRecord
  const presentation = buildBucketViewState({
    field: bucketIndex.field,
    spec: createBucketSpec(input.view.group),
    sort: input.view.group.bucketSort,
    values: input.index.records.values.get(input.view.group.field)?.byRecord,
    recordsByKey: bucketIndex.recordsByKey
  })
  const nextOrder = equal.sameOrder(previous.order, presentation.order)
    ? previous.order
    : presentation.order

  if (input.impact.query?.orderChanged || nextOrder !== previous.order) {
    const projectedRecordIds = fullVisible
      ? bucketIndex.recordsByKey
      : projectRecordIdsBySection({
          recordIds: input.query.records.visible,
          keysByRecord: nextKeysByRecord
        })
    const byKey = new Map<string, ReturnType<typeof buildMembershipNode>>()
    let changed = nextOrder !== previous.order
      || previous.byKey.size !== presentation.order.length
      || nextKeysByRecord !== previous.keysByRecord

    presentation.order.forEach(sectionKey => {
      const nextNode = buildMembershipNode({
        key: sectionKey,
        recordIds: projectedRecordIds.get(sectionKey) ?? EMPTY_RECORD_IDS,
        index: input.index,
        buckets: presentation.buckets as ReadonlyMap<string, Bucket>
      })
      const previousNode = previous.byKey.get(sectionKey)
      const published = previousNode && sameMembershipNode(previousNode, nextNode)
        ? previousNode
        : nextNode
      if (published !== previousNode) {
        changed = true
      }
      byKey.set(sectionKey, published)
    })

    return {
      state: changed
        ? {
            order: nextOrder,
            byKey,
            keysByRecord: nextKeysByRecord
          }
        : previous,
      records: recordChanges.size
        ? recordChanges
        : EMPTY_RECORD_CHANGES
    }
  }

  const touchedSections = recordChanges.size
    ? new Set<SectionKey>()
    : EMPTY_TOUCHED_SECTIONS
  if (recordChanges.size) {
    recordChanges.forEach(({ before, after }) => {
      before.forEach(sectionKey => {
        touchedSections.add(sectionKey)
      })
      after.forEach(sectionKey => {
        touchedSections.add(sectionKey)
      })
    })
  }
  const queryOrder = input.query.records.ordered === input.index.records.ids
    ? input.index.records.order
    : readQueryOrder(input.query)
  const byKey = new Map<string, ReturnType<typeof buildMembershipNode>>()
  let changed = nextOrder !== previous.order
    || previous.byKey.size !== presentation.order.length
    || nextKeysByRecord !== previous.keysByRecord

  presentation.order.forEach(sectionKey => {
    const previousNode = previous.byKey.get(sectionKey)
    const nextRecordIds = touchedSections.has(sectionKey)
      ? applyOrderedIdDelta({
          previous: previousNode?.recordIds ?? EMPTY_RECORD_IDS,
          remove: createRecordIdSet(
            [...recordChanges.entries()]
              .flatMap(([recordId, change]) => (
                change.before.includes(sectionKey) && !change.after.includes(sectionKey)
                  ? [recordId]
                  : []
              ))
          ),
          add: [...recordChanges.entries()]
            .flatMap(([recordId, change]) => (
              change.after.includes(sectionKey) && !change.before.includes(sectionKey)
                ? [recordId]
                : []
            )),
          order: queryOrder
        }) ?? EMPTY_RECORD_IDS
      : previousNode?.recordIds ?? bucketIndex.recordsByKey.get(sectionKey) ?? EMPTY_RECORD_IDS
    const nextNode = buildMembershipNode({
      key: sectionKey,
      recordIds: nextRecordIds,
      index: input.index,
      buckets: presentation.buckets as ReadonlyMap<string, Bucket>
    })
    const published = previousNode && sameMembershipNode(previousNode, nextNode)
      ? previousNode
      : nextNode
    if (published !== previousNode) {
      changed = true
    }
    byKey.set(sectionKey, published)
  })

  return {
    state: changed
      ? {
          order: nextOrder,
          byKey,
          keysByRecord: nextKeysByRecord
        }
      : previous,
    records: recordChanges.size
      ? recordChanges
      : EMPTY_RECORD_CHANGES
  }
}
