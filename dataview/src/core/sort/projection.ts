import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentViewById
} from '@dataview/core/document'
import type {
  SortRuleProjection,
  ViewSortProjection
} from './types'

export const resolveSortRuleProjection = (
  document: DataDoc,
  sorter: ViewSortProjection['rules'][number]['sorter']
): SortRuleProjection => {
  const field = getDocumentFieldById(document, sorter.field)

  return {
    sorter,
    fieldId: sorter.field,
    field,
    fieldLabel: field?.name ?? 'Deleted field'
  }
}

export const resolveViewSortProjection = (
  document: DataDoc,
  viewId: ViewId
): ViewSortProjection | undefined => {
  const view = getDocumentViewById(document, viewId)
  if (!view) {
    return undefined
  }

  return {
    viewId,
    active: view.sort.length > 0,
    rules: view.sort.map(sorter => resolveSortRuleProjection(document, sorter))
  }
}
