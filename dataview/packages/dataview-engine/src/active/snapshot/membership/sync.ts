import { equal } from '@shared/core'
import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  createBucketSpec,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import {
  readSelectionIdSet
} from '@dataview/engine/active/shared/selection'
import {
  EMPTY_SECTION_KEYS,
  ROOT_SECTION_KEYS,
  buildMembershipState,
  readMembershipKeysByRecord
} from '@dataview/engine/active/snapshot/membership/derive'
import type {
  MembershipRecordChange,
  MembershipState,
  QueryDelta,
  QueryState
} from '@dataview/engine/contracts/state'

const EMPTY_RECORD_CHANGES = new Map<RecordId, MembershipRecordChange>()
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

const sameSectionKeys = (
  left: readonly string[],
  right: readonly string[]
) => equal.sameOrder(left, right)

const resolveChangedRecordIds = (input: {
  impact: BaseImpact
  queryDelta: QueryDelta
  bucketDelta?: IndexDelta['bucket']
}): ReadonlySet<RecordId> | 'all' => {
  if (input.impact.touchedRecords === 'all') {
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

    if (sameSectionKeys(before, after)) {
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
  query: QueryState
  queryDelta: QueryDelta
  index: IndexState
  impact: BaseImpact
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

  const bucketIndex = readBucketIndex(input.index.bucket, createBucketSpec(input.view.group))
  const changedRecordIds = resolveChangedRecordIds({
    impact: input.impact,
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
