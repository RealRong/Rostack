import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  readGroupFieldIndex
} from '@dataview/engine/active/index/group/demand'
import {
  createMapOverlay
} from '@dataview/engine/active/shared/patch'
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
import type {
  SectionState
} from '@dataview/engine/contracts/internal'
import type { SectionKey } from '@dataview/engine/contracts/public'
import {
  buildRootSectionByRecord,
  buildSectionNode,
  buildSectionState,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER,
  sameSectionNode
} from '@dataview/engine/active/snapshot/sections/derive'
import {
  readQueryOrder,
  readQueryVisibleSet
} from '@dataview/engine/contracts/internal'

const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_RECORD_IDS = [] as readonly RecordId[]

const addSectionRecord = <T extends string>(
  target: Map<T, RecordId[]>,
  key: T,
  recordId: RecordId
) => {
  const ids = target.get(key)
  if (ids) {
    ids.push(recordId)
    return
  }

  target.set(key, [recordId])
}

const addChangedRecordIds = (
  target: Set<RecordId>,
  values?: readonly RecordId[]
) => {
  values?.forEach(recordId => {
    target.add(recordId)
  })
}

const resolveMembershipChangedRecordIds = (
  impact: ActiveImpact
): ReadonlySet<RecordId> | 'all' => {
  if (impact.base.touchedRecords === 'all') {
    return 'all'
  }

  const changed = new Set<RecordId>()
  addChangedRecordIds(changed, impact.query?.visibleAdded)
  addChangedRecordIds(changed, impact.query?.visibleRemoved)
  impact.group?.nextKeysByItem.forEach((_keys, recordId) => {
    changed.add(recordId)
  })

  return changed
}

const projectSectionRecordIds = (input: {
  recordIds: readonly RecordId[]
  byRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}): ReadonlyMap<SectionKey, readonly RecordId[]> => {
  const projected = new Map<SectionKey, RecordId[]>()

  input.recordIds.forEach(recordId => {
    const keys = input.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    keys.forEach(key => {
      addSectionRecord(projected, key, recordId)
    })
  })

  return projected
}

const syncRootSectionState = (input: {
  previous: SectionState
  query: import('@dataview/engine/contracts/internal').QueryState
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
    applyMembershipTransition(change, recordId, ROOT_SECTION_KEYS, EMPTY_SECTION_KEYS)
  })
  input.impact.query?.visibleAdded.forEach(recordId => {
    change ??= ensureSectionChange(input.impact)
    applyMembershipTransition(change, recordId, EMPTY_SECTION_KEYS, ROOT_SECTION_KEYS)
  })

  const nextOrder = sameOrder(input.previous.order, ROOT_SECTION_ORDER)
    ? input.previous.order
    : ROOT_SECTION_ORDER
  const nextRoot = {
    key: ROOT_SECTION_KEY,
    title: 'All',
    recordIds: input.query.records.visible,
    visible: true,
    collapsed: false
  }
  const publishedRoot = previousRoot && sameSectionNode(previousRoot, nextRoot)
    ? previousRoot
    : nextRoot

  if (
    publishedRoot === previousRoot
    && nextOrder === input.previous.order
    && !hasVisibleDelta
  ) {
    return input.previous
  }

  return {
    order: nextOrder,
    byKey: new Map([
      [ROOT_SECTION_KEY, publishedRoot] as const
    ]),
    byRecord: hasVisibleDelta
      ? buildRootSectionByRecord(input.query.records.visible)
      : input.previous.byRecord
  }
}

export const syncSectionState = (input: {
  previous?: SectionState
  view: View
  query: import('@dataview/engine/contracts/internal').QueryState
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

  const groupIndex = readGroupFieldIndex(input.index.group, input.view.group)
  const changedRecordIds = resolveMembershipChangedRecordIds(input.impact)
  if (!groupIndex || changedRecordIds === 'all') {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  const previous = input.previous
  const nextByRecordEntries = new Map<RecordId, readonly SectionKey[]>()
  const removedByRecord = new Set<RecordId>()
  let byRecordChanged = false
  let sectionChange = input.impact.sections
  let queryVisible: ReadonlySet<RecordId> | undefined
  const ensureQueryVisible = () => {
    if (!queryVisible) {
      queryVisible = readQueryVisibleSet(input.query)
    }

    return queryVisible
  }

  changedRecordIds.forEach(recordId => {
    const before = previous.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const after = ensureQueryVisible().has(recordId)
      ? input.impact.group?.nextKeysByItem.get(recordId)
        ?? groupIndex.recordBuckets.get(recordId)
        ?? EMPTY_SECTION_KEYS
      : EMPTY_SECTION_KEYS
    if (sameOrder(before, after)) {
      return
    }

    sectionChange ??= ensureSectionChange(input.impact)
    applyMembershipTransition(sectionChange, recordId, before, after)
    byRecordChanged = true
    if (after.length) {
      removedByRecord.delete(recordId)
      nextByRecordEntries.set(recordId, after)
      return
    }

    nextByRecordEntries.delete(recordId)
    removedByRecord.add(recordId)
  })

  const nextByRecord = byRecordChanged
    ? createMapOverlay({
        previous: previous.byRecord,
        set: nextByRecordEntries,
        delete: removedByRecord
      })
    : previous.byRecord
  const nextOrder = sameOrder(previous.order, groupIndex.order)
    ? previous.order
    : groupIndex.order

  if (input.impact.query?.orderChanged) {
    const projectedIds = projectSectionRecordIds({
      recordIds: input.query.records.visible,
      byRecord: nextByRecord
    })
    const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()
    let changed = nextOrder !== previous.order
      || previous.byKey.size !== groupIndex.order.length
      || byRecordChanged

    groupIndex.order.forEach(key => {
      const previousNode = previous.byKey.get(key)
      const nextNode = buildSectionNode({
        key,
        recordIds: projectedIds.get(key) ?? EMPTY_RECORD_IDS,
        group: input.view.group,
        index: input.index
      })
      const publishedNode = previousNode && sameSectionNode(previousNode, nextNode)
        ? previousNode
        : nextNode
      byKey.set(key, publishedNode)
      if (publishedNode !== previousNode) {
        changed = true
      }
    })

    return changed
      ? {
          order: nextOrder,
          byKey,
          byRecord: nextByRecord
        }
      : previous
  }

  const touchedSectionKeys = sectionChange?.touchedKeys
  if (
    !touchedSectionKeys?.size
    && nextOrder === previous.order
    && !byRecordChanged
  ) {
    return previous
  }

  const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()
  let changed = nextOrder !== previous.order
    || previous.byKey.size !== groupIndex.order.length
    || byRecordChanged
  let queryOrder: ReadonlyMap<RecordId, number> | undefined
  const ensureQueryOrder = () => {
    if (!queryOrder) {
      queryOrder = readQueryOrder(input.query)
    }

    return queryOrder
  }

  groupIndex.order.forEach(key => {
    const previousNode = previous.byKey.get(key)
    const ids = touchedSectionKeys?.has(key)
      ? (() => {
          const removed = sectionChange?.removedByKey.get(key)
          return applyOrderedIdDelta({
            previous: previousNode?.recordIds ?? EMPTY_RECORD_IDS,
            remove: removed?.length
              ? new Set(removed)
              : undefined,
            add: sectionChange?.addedByKey.get(key),
            order: ensureQueryOrder()
          })
        })()
      : previousNode?.recordIds ?? EMPTY_RECORD_IDS

    const nextNode = buildSectionNode({
      key,
      recordIds: ids,
      group: input.view.group,
      index: input.index
    })
    const publishedNode = previousNode && sameSectionNode(previousNode, nextNode)
      ? previousNode
      : nextNode
    byKey.set(key, publishedNode)
    if (publishedNode !== previousNode) {
      changed = true
    }
  })

  if (!changed) {
    return previous
  }

  return {
    order: nextOrder,
    byKey,
    byRecord: nextByRecord
  }
}
