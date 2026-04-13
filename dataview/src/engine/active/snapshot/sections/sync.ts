import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import type {
  IndexState
} from '../../index/contracts'
import {
  readGroupFieldIndex
} from '../../index/group/demand'
import type {
  QueryState,
  SectionState
} from '../../../contracts/internal'
import {
  buildSectionNode,
  buildSectionState,
  sameRecordIds,
  sameSectionNode,
  resolveSectionKeys
} from './derive'
import {
  readQueryOrder
} from '../../../contracts/internal'

const insertOrdered = (
  ids: RecordId[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
): void => {
  if (ids.includes(recordId)) {
    return
  }

  const nextOrder = order.get(recordId) ?? Number.MAX_SAFE_INTEGER
  const index = ids.findIndex(current => (
    (order.get(current) ?? Number.MAX_SAFE_INTEGER) > nextOrder
  ))

  if (index < 0) {
    ids.push(recordId)
    return
  }

  ids.splice(index, 0, recordId)
}

const removeId = (
  ids: RecordId[],
  recordId: RecordId
): void => {
  const index = ids.indexOf(recordId)
  if (index < 0) {
    return
  }

  ids.splice(index, 1)
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
  const queryOrder = readQueryOrder(input.query)
  const idsByKey = new Map<import('../../../contracts/public').SectionKey, RecordId[]>()
  let byRecord: Map<RecordId, readonly import('../../../contracts/public').SectionKey[]> | undefined
  const ensureIds = (
    key: import('../../../contracts/public').SectionKey
  ) => {
    const cached = idsByKey.get(key)
    if (cached) {
      return cached
    }

    const next = [...(previous.byKey.get(key)?.recordIds ?? [])]
    idsByKey.set(key, next)
    return next
  }
  const ensureByRecord = () => {
    if (!byRecord) {
      byRecord = new Map(previous.byRecord)
    }

    return byRecord
  }

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
      removeId(ensureIds(key), recordId)
    })
    after.forEach(key => {
      insertOrdered(
        ensureIds(key),
        recordId,
        queryOrder
      )
    })

    if (after.length) {
      ensureByRecord().set(recordId, after)
      return
    }

    ensureByRecord().delete(recordId)
  })

  if (!idsByKey.size && !byRecord) {
    return previous
  }

  const order = readGroupFieldIndex(input.index.group, input.view.group)?.order ?? []
  const byKey = new Map(previous.byKey)
  byKey.clear()

  order.forEach(key => {
    const ids = idsByKey.get(key) ?? previous.byKey.get(key)?.recordIds ?? []
    const nextNode = buildSectionNode({
      key,
      recordIds: ids,
      group: input.view.group,
      index: input.index,
      previous: previous.byKey.get(key)
    })
    const previousNode = previous.byKey.get(key)
    byKey.set(key, previousNode && sameSectionNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  return {
    order: sameRecordIds(previous.order, order)
      ? previous.order
      : order,
    byKey,
    byRecord: byRecord ?? previous.byRecord
  }
}
