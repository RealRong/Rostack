import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentViewById
} from '@dataview/core/document'
import type {
  ViewSearchProjection
} from './types'

export const resolveViewSearchProjection = (
  document: DataDoc,
  viewId: ViewId
): ViewSearchProjection | undefined => {
  const view = getDocumentViewById(document, viewId)
  if (!view) {
    return undefined
  }

  return {
    viewId,
    search: view.search,
    query: view.search.query,
    ...(view.search.fields?.length
      ? { fields: [...view.search.fields] }
      : {}),
    active: Boolean(view.search.query.trim())
  }
}
