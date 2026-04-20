import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import type { Bucket } from '@dataview/core/field'
import {
  sameOrder
} from '@shared/core'
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
  applyMembershipTransition,
  ensureSectionChange
} from '@dataview/engine/active/shared/impact'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import {
  EMPTY_SECTION_KEYS,
  projectRecordIdsBySection,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER,
  sameSectionKeys
} from '@dataview/engine/active/shared/sections'
import type {
  SectionKey,
} from '@dataview/engine/contracts/public'
import type {
  QueryState,
  SectionState
} from '@dataview/engine/contracts/internal'
import {
  buildSectionNode,
  buildSectionState,
  sameSectionNode
} from '@dataview/engine/active/snapshot/sections/derive'
import {
  readQueryOrder,
  readQueryVisibleSet
} from '@dataview/engine/contracts/internal'
import {
  tokenRef
} from '@shared/i18n'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
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
  impact.bucket?.nextKeysByItem.forEach((_keys, recordId) => {
    changed.add(recordId)
  })
  return changed
}

const buildRootKeysByRecord = (
  recordIds: readonly RecordId[]
): ReadonlyMap<RecordId, readonly SectionKey[]> => new Map(
  recordIds.map(recordId => [recordId, ROOT_SECTION_KEYS] as const)
)

const syncRootSectionState = (input: {
  previous: SectionState
  query: QueryState
  impact: ActiveImpact
}): SectionState => {
  const previousRoot = input.previous.byKey.get(ROOT_SECTION_KEY)
  let change = input.impact.sections
  const hasVisibleDelta = Boolean(
    input.impact.query?.visibleAdded.length
    || input.impact.query?.visibleRemoved.length
  )

  input.impact.query?.visibleRemoved.forEach(recordId => {
    change ??= ensureSectionChange(input.impact)
    applyMembershipTransition(change, recordId, ROOT_SECTION_KEYS, [])
  })
  input.impact.query?.visibleAdded.forEach(recordId => {
    change ??= ensureSectionChange(input.impact)
    applyMembershipTransition(change, recordId, [], ROOT_SECTION_KEYS)
  })

  const nextRoot = {
    key: ROOT_SECTION_KEY,
    label: ROOT_SECTION_LABEL,
    recordIds: input.query.records.visible,
    visible: true,
    collapsed: false
  }
  const publishedRoot = previousRoot && sameSectionNode(previousRoot, nextRoot)
    ? previousRoot
    : nextRoot
  const keysByRecord = buildRootKeysByRecord(input.query.records.visible)

  if (
    publishedRoot === previousRoot
    && input.previous.order === ROOT_SECTION_ORDER
    && !hasVisibleDelta
    && input.previous.keysByRecord.size === keysByRecord.size
  ) {
    return input.previous
  }

  return {
    order: ROOT_SECTION_ORDER,
    byKey: new Map([
      [ROOT_SECTION_KEY, publishedRoot] as const
    ]),
    keysByRecord
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
  previous: SectionState
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

export const syncSectionState = (input: {
  previous?: SectionState
  view: View
  query: QueryState
  index: IndexState
  impact: ActiveImpact
  action: 'reuse' | 'sync' | 'rebuild'
}): SectionState => {
  if (input.action === 'reuse' && input.previous) {
    return input.previous
  }

  if (
    !input.previous
    || input.action === 'rebuild'
  ) {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  if (!input.view.group) {
    return syncRootSectionState({
      previous: input.previous,
      query: input.query,
      impact: input.impact
    })
  }

  const previous = input.previous
  const bucketIndex = readBucketIndex(input.index.bucket, createBucketSpec(input.view.group))
  const changedRecordIds = resolveChangedRecordIds(input.impact)
  if (!bucketIndex || changedRecordIds === 'all') {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous
    })
  }

  if (shouldRebuildGroupedSections({
    previous,
    query: input.query,
    changedRecordIds
  })) {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous
    })
  }

  const fullVisible = input.query.records.visible === input.index.records.ids
  const visible = fullVisible
    ? undefined
    : readQueryVisibleSet(input.query)
  let sectionChange = input.impact.sections
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

    sectionChange ??= ensureSectionChange(input.impact)
    applyMembershipTransition(sectionChange, recordId, before, after)
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
  const nextOrder = sameOrder(previous.order, presentation.order)
    ? previous.order
    : presentation.order

  if (input.impact.query?.orderChanged || nextOrder !== previous.order) {
    const projectedRecordIds = fullVisible
      ? bucketIndex.recordsByKey
      : projectRecordIdsBySection({
        recordIds: input.query.records.visible,
        keysByRecord: nextKeysByRecord
      })
    const byKey = new Map<string, ReturnType<typeof buildSectionNode>>()
    let changed = nextOrder !== previous.order
      || previous.byKey.size !== presentation.order.length
      || nextKeysByRecord !== previous.keysByRecord

    presentation.order.forEach(sectionKey => {
      const nextNode = buildSectionNode({
        key: sectionKey,
        recordIds: projectedRecordIds.get(sectionKey) ?? EMPTY_RECORD_IDS,
        group: input.view.group,
        index: input.index,
        buckets: presentation.buckets as ReadonlyMap<string, Bucket>
      })
      const previousNode = previous.byKey.get(sectionKey)
      const published = previousNode && sameSectionNode(previousNode, nextNode)
        ? previousNode
        : nextNode
      if (published !== previousNode) {
        changed = true
      }
      byKey.set(sectionKey, published)
    })

    return changed
      ? {
          order: nextOrder,
          byKey,
          keysByRecord: nextKeysByRecord
        }
      : previous
  }

  const touchedSections = sectionChange?.touchedKeys ?? EMPTY_TOUCHED_SECTIONS
  const queryOrder = input.query.records.ordered === input.index.records.ids
    ? input.index.records.order
    : readQueryOrder(input.query)
  const byKey = new Map<string, ReturnType<typeof buildSectionNode>>()
  let changed = nextOrder !== previous.order
    || previous.byKey.size !== presentation.order.length
    || nextKeysByRecord !== previous.keysByRecord

  presentation.order.forEach(sectionKey => {
    const previousNode = previous.byKey.get(sectionKey)
    const nextRecordIds = touchedSections.has(sectionKey)
      ? applyOrderedIdDelta({
          previous: previousNode?.recordIds ?? EMPTY_RECORD_IDS,
          remove: createRecordIdSet(sectionChange?.removedByKey.get(sectionKey)),
          add: sectionChange?.addedByKey.get(sectionKey),
          order: queryOrder
        }) ?? EMPTY_RECORD_IDS
      : previousNode?.recordIds ?? bucketIndex.recordsByKey.get(sectionKey) ?? EMPTY_RECORD_IDS
    const nextNode = buildSectionNode({
      key: sectionKey,
      recordIds: nextRecordIds,
      group: input.view.group,
      index: input.index,
      buckets: presentation.buckets as ReadonlyMap<string, Bucket>
    })
    const published = previousNode && sameSectionNode(previousNode, nextNode)
      ? previousNode
      : nextNode
    if (published !== previousNode) {
      changed = true
    }
    byKey.set(sectionKey, published)
  })

  return changed
    ? {
        order: nextOrder,
        byKey,
        keysByRecord: nextKeysByRecord
      }
    : previous
}
