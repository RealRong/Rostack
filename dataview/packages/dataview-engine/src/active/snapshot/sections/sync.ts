import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import { sameOrder } from '@shared/core'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  insertOrderedIdInPlace,
  removeOrderedIdInPlace
} from '@dataview/engine/active/index/shared'
import {
  readGroupFieldIndex
} from '@dataview/engine/active/index/group/demand'
import type {
  QueryState,
  SectionState
} from '@dataview/engine/contracts/internal'
import type { SectionKey } from '@dataview/engine/contracts/public'
import {
  buildSectionNode,
  buildSectionState,
  sameSectionNode
} from '@dataview/engine/active/snapshot/sections/derive'
import {
  readQueryOrder,
  readQueryVisibleSet
} from '@dataview/engine/contracts/internal'

const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_RECORD_IDS = [] as readonly RecordId[]

export const syncSectionState = (input: {
  previous?: SectionState
  previousQuery?: QueryState
  view: View
  query: QueryState
  index: IndexState
  touchedRecords: ReadonlySet<RecordId> | 'all'
  action: 'reuse' | 'sync' | 'rebuild'
}): SectionState => {
  if (input.action === 'reuse' && input.previous) {
    return input.previous
  }

  if (
    !input.previous
    || !input.previousQuery
    || input.action === 'rebuild'
    || input.touchedRecords === 'all'
    || input.previousQuery.records.visible !== input.query.records.visible
    || input.previousQuery.records.ordered !== input.query.records.ordered
  ) {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  if (!input.view.group) {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  const previous = input.previous
  const groupIndex = readGroupFieldIndex(input.index.group, input.view.group)
  if (!groupIndex) {
    return buildSectionState({
      view: input.view,
      query: input.query,
      index: input.index,
      previous: input.previous
    })
  }

  const queryVisible = readQueryVisibleSet(input.query)
  const queryOrder = readQueryOrder(input.query)
  const touchedSectionKeys = new Set<SectionKey>()
  const touchedRecordsBySection = new Map<SectionKey, RecordId[]>()
  const addTouchedRecord = (
    sectionKey: SectionKey,
    recordId: RecordId
  ) => {
    const ids = touchedRecordsBySection.get(sectionKey)
    if (ids) {
      ids.push(recordId)
      return
    }
    touchedRecordsBySection.set(sectionKey, [recordId])
  }
  let byRecord: Map<RecordId, readonly SectionKey[]> | undefined

  input.touchedRecords.forEach(recordId => {
    const before = previous.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const after = queryVisible.has(recordId)
      ? groupIndex.recordBuckets.get(recordId) ?? EMPTY_SECTION_KEYS
      : EMPTY_SECTION_KEYS

    if (sameOrder(before, after)) {
      return
    }

    before.forEach(key => touchedSectionKeys.add(key))
    after.forEach(key => touchedSectionKeys.add(key))
    before.forEach(key => addTouchedRecord(key, recordId))
    after.forEach(key => addTouchedRecord(key, recordId))

    if (!byRecord) {
      byRecord = new Map(previous.byRecord)
    }

    if (after.length) {
      byRecord.set(recordId, after)
      return
    }

    byRecord.delete(recordId)
  })

  if (!byRecord || !touchedSectionKeys.size) {
    return previous
  }

  const idsByKey = new Map<SectionKey, readonly RecordId[]>()
  touchedSectionKeys.forEach(key => {
    const previousNode = previous.byKey.get(key)
    const nextIds = previousNode
      ? [...previousNode.recordIds]
      : []
    const sectionTouchedRecords = touchedRecordsBySection.get(key) ?? EMPTY_RECORD_IDS

    sectionTouchedRecords.forEach(recordId => {
      const before = previous.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
      const after = byRecord?.get(recordId) ?? EMPTY_SECTION_KEYS
      const wasInSection = before.includes(key)
      const isInSection = after.includes(key)
      if (wasInSection === isInSection) {
        return
      }

      if (isInSection) {
        insertOrderedIdInPlace(nextIds, recordId, queryOrder)
        return
      }

      removeOrderedIdInPlace(nextIds, recordId)
    })

    if (nextIds.length) {
      idsByKey.set(key, nextIds)
    }
  })

  const order = groupIndex.order
  const nextOrder = sameOrder(previous.order, order)
    ? previous.order
    : order
  const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()
  let changed = nextOrder !== previous.order || previous.byKey.size !== order.length

  order.forEach(key => {
    const previousNode = previous.byKey.get(key)
    const ids = touchedSectionKeys.has(key)
      ? idsByKey.get(key) ?? EMPTY_RECORD_IDS
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

  if (!changed && byRecord === previous.byRecord) {
    return previous
  }

  return {
    order: nextOrder,
    byKey,
    byRecord
  }
}
