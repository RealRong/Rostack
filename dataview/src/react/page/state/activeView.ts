import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentViews
} from '@dataview/core/document'

export const resolveActiveViewId = (
  document: DataDoc,
  viewId?: ViewId
) => {
  const views = getDocumentViews(document)
  if (!viewId) {
    return views[0]?.id
  }

  return views.some(view => view.id === viewId)
    ? viewId
    : views[0]?.id
}
