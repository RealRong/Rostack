import type {
  DataDoc,
  Row,
  View,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentRecords,
  getDocumentActiveViewId,
  getDocumentViewById,
} from '@dataview/core/document'
import { matchFilterRule } from '@dataview/core/filter'
import {
  matchSearchRecord
} from '@dataview/core/search'
import {
  compareSortedRecords
} from '@dataview/core/sort'
import { isFilterRuleEffective } from '@dataview/core/filter'
import { applyRecordOrder, normalizeRecordOrderIds } from '@dataview/core/view/order'

export interface ResolvedViewRecordState {
  view?: View
  derivedRecords: readonly Row[]
  orderedRecords: readonly Row[]
  visibleRecords: readonly Row[]
}

const sortRecords = (
  records: Row[],
  document: DataDoc,
  view?: View
) => {
  const sorters = view?.sort ?? []
  const recordOrderIndex = new Map(
    getDocumentRecords(document).map((record, index) => [record.id, index] as const)
  )

  return [...records].sort((left, right) => {
    for (const sorter of sorters) {
      const result = compareSortedRecords(left, right, sorter, document)
      if (result !== 0) {
        return result
      }
    }

    return (recordOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (recordOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  })
}

const applyViewOrders = (
  records: readonly Row[],
  view: View | undefined
) => {
  if (!view || view.sort.length > 0) {
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
    .filter((record): record is Row => Boolean(record))
}

const filterViewRecords = (
  records: readonly Row[],
  document: DataDoc,
  view: View | undefined
) => {
  if (!view) {
    return [...records]
  }

  const filter = view.filter
  const search = view.search
  let nextRecords = [...records]
  const filterMode = filter.mode
  const effectiveFilterRules = filter.rules.filter(rule => (
    isFilterRuleEffective(getDocumentFieldById(document, rule.fieldId), rule)
  ))

  if (effectiveFilterRules.length) {
    nextRecords = nextRecords.filter(record => {
      const results = effectiveFilterRules.map(rule => {
        const field = getDocumentFieldById(document, rule.fieldId)
        const value = record.values[rule.fieldId as keyof typeof record.values]
        return matchFilterRule(
          field,
          rule.fieldId === 'title'
            ? record.title
            : value,
          rule
        )
      })
      return filterMode === 'or' ? results.some(Boolean) : results.every(Boolean)
    })
  }

  if (search.query.trim()) {
    nextRecords = nextRecords.filter(record => matchSearchRecord(record, search, document))
  }

  return nextRecords
}

export const currentView = (
  document: DataDoc,
  viewId?: ViewId
) => {
  const targetViewId = viewId ?? getDocumentActiveViewId(document)
  if (!targetViewId) {
    return undefined
  }

  return getDocumentViewById(document, targetViewId)
}

export const derivedViewRecords = (
  document: DataDoc,
  viewId?: ViewId
) => {
  const view = currentView(document, viewId)
  return sortRecords(getDocumentRecords(document), document, view)
}

export const orderedViewRecords = (
  document: DataDoc,
  viewId?: ViewId
) => {
  const view = currentView(document, viewId)
  return applyViewOrders(derivedViewRecords(document, viewId), view)
}

export const visibleViewRecords = (
  document: DataDoc,
  viewId?: ViewId
) => {
  const view = currentView(document, viewId)
  return filterViewRecords(orderedViewRecords(document, viewId), document, view)
}

export const resolveViewRecordState = (
  document: DataDoc,
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
