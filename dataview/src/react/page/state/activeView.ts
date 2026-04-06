import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentViews
} from '@dataview/core/document'

export const resolveActiveViewId = (
  document: DataDoc,
  activeViewId?: ViewId
) => {
  const views = getDocumentViews(document)
  if (!activeViewId) {
    return views[0]?.id
  }

  return views.some(view => view.id === activeViewId)
    ? activeViewId
    : views[0]?.id
}
