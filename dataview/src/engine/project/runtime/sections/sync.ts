import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import type {
  IndexState
} from '../../../index/types'
import {
  readGroupFieldIndex
} from '../../../index/group'
import type {
  QueryState,
  SectionState
} from '../state'
import {
  buildSectionState,
  resolveSectionKeys
} from './derive'
import {
  buildSectionNode,
  sameRecordIds,
  sameSectionNode
} from './shape'

const insertOrdered = (
  ids: readonly RecordId[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => {
  if (ids.includes(recordId)) {
    return ids
  }

  const nextOrder = order.get(recordId) ?? Number.MAX_SAFE_INTEGER
  const next = [...ids]
  const index = next.findIndex(current => (
    (order.get(current) ?? Number.MAX_SAFE_INTEGER) > nextOrder
  ))

  if (index < 0) {
    next.push(recordId)
    return next
  }

  next.splice(index, 0, recordId)
  return next
}

const removeId = (
  ids: readonly RecordId[],
  recordId: RecordId
): readonly RecordId[] => {
  const index = ids.indexOf(recordId)
  if (index < 0) {
    return ids
  }

  return [
    ...ids.slice(0, index),
    ...ids.slice(index + 1)
  ]
}

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
    || input.previousQuery.visible !== input.query.visible
    || input.previousQuery.ordered !== input.query.ordered
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
  const idsByKey = new Map(
    Array.from(previous.byKey.entries(), ([key, node]) => [
      key,
      [...node.ids]
    ] as const)
  )
  const byRecord = new Map(previous.byRecord)

  input.touchedRecords.forEach(recordId => {
    const before = previous.byRecord.get(recordId) ?? []
    const after = resolveSectionKeys({
      recordId,
      query: input.query,
      view: input.view,
      index: input.index
    })

    if (sameRecordIds(before, after)) {
      return
    }

    before.forEach(key => {
      idsByKey.set(key, removeId(idsByKey.get(key) ?? [], recordId))
    })
    after.forEach(key => {
      idsByKey.set(key, insertOrdered(idsByKey.get(key) ?? [], recordId, input.query.order))
    })

    if (after.length) {
      byRecord.set(recordId, after)
      return
    }

    byRecord.delete(recordId)
  })

  const order = readGroupFieldIndex(input.index.group, input.view.group)?.order ?? []
  const byKey = new Map(previous.byKey)
  byKey.clear()

  order.forEach(key => {
    const ids = idsByKey.get(key) ?? []
    const nextNode = buildSectionNode({
      key,
      ids,
      group: input.view.group,
      index: input.index
    })
    const previousNode = previous.byKey.get(key)
    byKey.set(key, previousNode && sameSectionNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  return {
    order: sameRecordIds(previous.order, order)
      ? previous.order
      : order,
    byKey,
    byRecord
  }
}
