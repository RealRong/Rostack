import type {
  GroupDocument,
  GroupRecord,
  GroupView,
  RecordId,
  ViewId
} from '@/core/contracts'
import {
  getDocumentPropertyById,
  getDocumentRecords,
  getDocumentViewById,
  getDocumentViews
} from '@/core/document'
import { isFilterRuleEffective } from '@/core/property'
import { applyRecordOrder, normalizeRecordOrderIds } from '@/core/view/order'
import {
  compareGroupSort,
  matchGroupFilter,
  matchGroupSearch
} from '@/core/query/semantics'

export interface ResolvedViewRecordState {
  view?: GroupView
  derivedRecords: readonly GroupRecord[]
  orderedRecords: readonly GroupRecord[]
  visibleRecords: readonly GroupRecord[]
}

const sortRecords = (
  records: GroupRecord[],
  document: GroupDocument,
  view?: GroupView
) => {
  const sorters = view?.query.sorters ?? []
  const recordOrderIndex = new Map(
    getDocumentRecords(document).map((record, index) => [record.id, index] as const)
  )

  return [...records].sort((left, right) => {
    for (const sorter of sorters) {
      const result = compareGroupSort(left, right, sorter, document)
      if (result !== 0) {
        return result
      }
    }

    return (recordOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (recordOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  })
}

const applyViewOrders = (
  records: readonly GroupRecord[],
  view: GroupView | undefined
) => {
  if (!view || view.query.sorters.length > 0) {
    return [...records]
  }

  const recordIdSet = new Set(records.map(record => record.id))
  const normalizedOrders = normalizeRecordOrderIds(view.orders, recordIdSet)
  if (!normalizedOrders.length) {
    return [...records]
  }

  const recordById = new Map(records.map(record => [record.id, record] as const))
  return applyRecordOrder(
    records.map(record => record.id),
    normalizedOrders
  )
    .map(recordId => recordById.get(recordId))
    .filter((record): record is GroupRecord => Boolean(record))
}

const filterViewRecords = (
  records: readonly GroupRecord[],
  document: GroupDocument,
  view: GroupView | undefined
) => {
  if (!view) {
    return [...records]
  }

  const query = view.query
  let nextRecords = [...records]
  const filterMode = query.filter.mode
  const effectiveFilterRules = query.filter.rules.filter(rule => (
    isFilterRuleEffective(
      getDocumentPropertyById(document, rule.property),
      rule.op,
      rule.value
    )
  ))

  if (effectiveFilterRules.length) {
    nextRecords = nextRecords.filter(record => {
      const results = effectiveFilterRules.map(rule => matchGroupFilter(record, rule, document))
      return filterMode === 'or' ? results.some(Boolean) : results.every(Boolean)
    })
  }

  if (query.search.query.trim()) {
    nextRecords = nextRecords.filter(record => matchGroupSearch(record, query.search, document))
  }

  return nextRecords
}

export const currentView = (
  document: GroupDocument,
  viewId?: ViewId
) => {
  const targetViewId = viewId ?? getDocumentViews(document)[0]?.id
  if (!targetViewId) {
    return undefined
  }

  return getDocumentViewById(document, targetViewId)
}

export const derivedViewRecords = (
  document: GroupDocument,
  viewId?: ViewId
) => {
  const view = currentView(document, viewId)
  return sortRecords(getDocumentRecords(document), document, view)
}

export const orderedViewRecords = (
  document: GroupDocument,
  viewId?: ViewId
) => {
  const view = currentView(document, viewId)
  return applyViewOrders(derivedViewRecords(document, viewId), view)
}

export const visibleViewRecords = (
  document: GroupDocument,
  viewId?: ViewId
) => {
  const view = currentView(document, viewId)
  return filterViewRecords(orderedViewRecords(document, viewId), document, view)
}

export const resolveViewRecordState = (
  document: GroupDocument,
  viewId?: ViewId
): ResolvedViewRecordState => {
  const view = currentView(document, viewId)
  const derivedRecords = sortRecords(getDocumentRecords(document), document, view)
  const orderedRecords = applyViewOrders(derivedRecords, view)
  const visibleRecords = filterViewRecords(orderedRecords, document, view)

  return {
    view,
    derivedRecords,
    orderedRecords,
    visibleRecords
  }
}
