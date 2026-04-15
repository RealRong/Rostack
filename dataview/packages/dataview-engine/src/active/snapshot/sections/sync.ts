import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import { sameOrder } from '@shared/core'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
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
  const touchedSectionKeys = new Set<SectionKey>()
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

  const idsByKey = new Map<SectionKey, RecordId[]>()
  input.query.records.visible.forEach(recordId => {
    const keys = groupIndex.recordBuckets.get(recordId) ?? EMPTY_SECTION_KEYS
    if (!keys.some(key => touchedSectionKeys.has(key))) {
      return
    }

    keys.forEach(key => {
      if (!touchedSectionKeys.has(key)) {
        return
      }

      const ids = idsByKey.get(key)
      if (ids) {
        ids.push(recordId)
        return
      }

      idsByKey.set(key, [recordId])
    })
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
      index: input.index,
      previous: previousNode
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
