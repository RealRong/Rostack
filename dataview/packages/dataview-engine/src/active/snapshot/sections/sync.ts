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
  readSectionGroupIndex
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
import {
  createSectionMembershipResolver,
  createSectionMembershipResolverFromState,
  projectRecordIdsBySection,
  ROOT_SECTION_KEY,
  ROOT_SECTION_KEYS,
  ROOT_SECTION_ORDER,
  sameSectionKeys
} from '@dataview/engine/active/shared/sections'
import type {
  SectionState
} from '@dataview/engine/contracts/internal'
import {
  buildSectionNode,
  buildSectionState,
  sameSectionNode
} from '@dataview/engine/active/snapshot/sections/derive'
import {
  readQueryOrder
} from '@dataview/engine/contracts/internal'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_TOUCHED_SECTIONS = new Set<string>()

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

const createRecordIdSet = (
  ids?: readonly RecordId[]
): ReadonlySet<RecordId> | undefined => ids?.length
  ? new Set(ids)
  : undefined

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
    applyMembershipTransition(change, recordId, ROOT_SECTION_KEYS, [])
  })
  input.impact.query?.visibleAdded.forEach(recordId => {
    change ??= ensureSectionChange(input.impact)
    applyMembershipTransition(change, recordId, [], ROOT_SECTION_KEYS)
  })

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
    && input.previous.order === ROOT_SECTION_ORDER
    && !hasVisibleDelta
  ) {
    return input.previous
  }

  return {
    order: ROOT_SECTION_ORDER,
    byKey: new Map([
      [ROOT_SECTION_KEY, publishedRoot] as const
    ])
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

  const sectionGroup = readSectionGroupIndex(input.index.group, input.view.group)
  const changedRecordIds = resolveMembershipChangedRecordIds(input.impact)
  if (!sectionGroup || changedRecordIds === 'all') {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  const previous = input.previous
  const previousResolver = createSectionMembershipResolverFromState(previous, {
    recordIds: changedRecordIds
  })
  const nextResolver = createSectionMembershipResolver({
    query: input.query,
    view: input.view,
    sectionGroup
  })
  let sectionChange = input.impact.sections

  changedRecordIds.forEach(recordId => {
    const before = previousResolver.keysOf(recordId)
    const after = nextResolver.keysOf(recordId)
    if (sameSectionKeys(before, after)) {
      return
    }

    sectionChange ??= ensureSectionChange(input.impact)
    applyMembershipTransition(sectionChange, recordId, before, after)
  })

  const nextOrder = sameOrder(previous.order, sectionGroup.order)
    ? previous.order
    : sectionGroup.order

  if (input.impact.query?.orderChanged) {
    const projectedIds = projectRecordIdsBySection({
      recordIds: input.query.records.visible,
      resolver: nextResolver
    })
    const byKey = new Map<string, ReturnType<typeof buildSectionNode>>()
    let changed = nextOrder !== previous.order
      || previous.byKey.size !== sectionGroup.order.length

    sectionGroup.order.forEach(key => {
      const nextNode = buildSectionNode({
        key,
        recordIds: projectedIds.get(key) ?? EMPTY_RECORD_IDS,
        group: input.view.group,
        index: input.index
      })
      const previousNode = previous.byKey.get(key)
      const published = previousNode && sameSectionNode(previousNode, nextNode)
        ? previousNode
        : nextNode
      if (published !== previousNode) {
        changed = true
      }
      byKey.set(key, published)
    })

    return changed
      ? {
          order: nextOrder,
          byKey
        }
      : previous
  }

  const touchedSections = sectionChange?.touchedKeys ?? EMPTY_TOUCHED_SECTIONS
  const queryOrder = readQueryOrder(input.query)
  const byKey = new Map<string, ReturnType<typeof buildSectionNode>>()
  let changed = nextOrder !== previous.order
    || previous.byKey.size !== sectionGroup.order.length

  sectionGroup.order.forEach(sectionKey => {
    const previousNode = previous.byKey.get(sectionKey)
    const nextRecordIds = touchedSections.has(sectionKey)
      ? applyOrderedIdDelta({
          previous: previousNode?.recordIds ?? EMPTY_RECORD_IDS,
          remove: createRecordIdSet(sectionChange?.removedByKey.get(sectionKey)),
          add: sectionChange?.addedByKey.get(sectionKey),
          order: queryOrder
        }) ?? EMPTY_RECORD_IDS
      : previousNode?.recordIds ?? sectionGroup.sectionRecords.get(sectionKey) ?? EMPTY_RECORD_IDS
    const nextNode = buildSectionNode({
      key: sectionKey,
      recordIds: nextRecordIds,
      group: input.view.group,
      index: input.index
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
        byKey
      }
    : previous
}
