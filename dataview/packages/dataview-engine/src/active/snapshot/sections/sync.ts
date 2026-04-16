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
  buildSectionNode,
  buildSectionState,
  ROOT_SECTION_KEY,
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

const appendUniqueRecordIds = (
  target: RecordId[],
  seen: Set<RecordId>,
  values?: readonly RecordId[]
) => {
  if (!values?.length) {
    return
  }

  values.forEach(recordId => {
    if (seen.has(recordId)) {
      return
    }

    seen.add(recordId)
    target.push(recordId)
  })
}

const addUniqueRecordIdsToSet = (
  target: Set<RecordId>,
  values?: readonly RecordId[]
) => {
  values?.forEach(recordId => {
    target.add(recordId)
  })
}

const addChangedRecordIds = (
  target: Set<RecordId>,
  values?: readonly RecordId[]
) => {
  values?.forEach(recordId => {
    target.add(recordId)
  })
}

const resolveChangedRecordIds = (
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

  if (impact.query?.orderChanged) {
    impact.base.touchedRecords.forEach(recordId => {
      changed.add(recordId)
    })
  }

  return changed
}

const syncRootSectionState = (input: {
  previous: SectionState
  view: View
  query: import('@dataview/engine/contracts/internal').QueryState
  index: IndexState
  impact: ActiveImpact
}): SectionState => {
  const change = ensureSectionChange(input.impact)

  input.impact.query?.visibleRemoved.forEach(recordId => {
    applyMembershipTransition(change, recordId, [ROOT_SECTION_KEY], EMPTY_SECTION_KEYS)
  })
  input.impact.query?.visibleAdded.forEach(recordId => {
    applyMembershipTransition(change, recordId, EMPTY_SECTION_KEYS, [ROOT_SECTION_KEY])
  })

  return buildSectionState({
    view: input.view,
    query: input.query,
    index: input.index,
    previous: input.previous
  })
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
      view: input.view,
      query: input.query,
      index: input.index,
      impact: input.impact
    })
  }

  const groupIndex = readGroupFieldIndex(input.index.group, input.view.group)
  const changedRecordIds = resolveChangedRecordIds(input.impact)
  if (!groupIndex || changedRecordIds === 'all') {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  const previous = input.previous
  const queryVisible = readQueryVisibleSet(input.query)
  const queryOrder = readQueryOrder(input.query)
  const sectionChange = ensureSectionChange(input.impact)
  const touchedSectionKeys = new Set<SectionKey>()
  const removedBySection = new Map<SectionKey, RecordId[]>()
  const addedBySection = new Map<SectionKey, RecordId[]>()
  const reorderedBySection = new Map<SectionKey, RecordId[]>()
  let byRecord: Map<RecordId, readonly SectionKey[]> | undefined

  changedRecordIds.forEach(recordId => {
    const before = previous.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const after = queryVisible.has(recordId)
      ? input.impact.group?.nextKeysByItem.get(recordId)
        ?? groupIndex.recordBuckets.get(recordId)
        ?? EMPTY_SECTION_KEYS
      : EMPTY_SECTION_KEYS
    const membershipChanged = !sameOrder(before, after)

    if (!membershipChanged && !input.impact.query?.orderChanged) {
      return
    }

    if (membershipChanged) {
      applyMembershipTransition(sectionChange, recordId, before, after)
      before.forEach(key => {
        touchedSectionKeys.add(key)
        if (!after.includes(key)) {
          addSectionRecord(removedBySection, key, recordId)
        }
      })
      after.forEach(key => {
        touchedSectionKeys.add(key)
        if (!before.includes(key)) {
          addSectionRecord(addedBySection, key, recordId)
        }
      })

      if (!byRecord) {
        byRecord = new Map(previous.byRecord)
      }

      if (after.length) {
        byRecord.set(recordId, after)
      } else {
        byRecord.delete(recordId)
      }
    }

    if (input.impact.query?.orderChanged) {
      const reorderedKeys = membershipChanged
        ? after.filter(key => before.includes(key))
        : after
      reorderedKeys.forEach(key => {
        touchedSectionKeys.add(key)
        addSectionRecord(reorderedBySection, key, recordId)
      })
    }
  })

  const nextOrder = sameOrder(previous.order, groupIndex.order)
    ? previous.order
    : groupIndex.order
  if (!touchedSectionKeys.size && nextOrder === previous.order && byRecord === undefined) {
    return previous
  }

  const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()
  let changed = nextOrder !== previous.order || previous.byKey.size !== groupIndex.order.length

  groupIndex.order.forEach(key => {
    const previousNode = previous.byKey.get(key)
    const ids = touchedSectionKeys.has(key)
      ? (() => {
          const remove = new Set<RecordId>()
          addUniqueRecordIdsToSet(remove, removedBySection.get(key))
          addUniqueRecordIdsToSet(remove, reorderedBySection.get(key))

          const add: RecordId[] = []
          const seenAdd = new Set<RecordId>()
          appendUniqueRecordIds(add, seenAdd, addedBySection.get(key))
          appendUniqueRecordIds(add, seenAdd, reorderedBySection.get(key))

          return applyOrderedIdDelta({
            previous: previousNode?.recordIds ?? EMPTY_RECORD_IDS,
            remove: remove.size
              ? remove
              : undefined,
            add: add.length
              ? add
              : undefined,
            order: queryOrder
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

  if (!changed && byRecord === undefined) {
    return previous
  }

  return {
    order: nextOrder,
    byKey,
    byRecord: byRecord ?? previous.byRecord
  }
}
