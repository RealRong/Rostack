import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentViewById
} from '@dataview/core/document'
import type {
  ActiveView
} from '../types'

export const resolveActiveView = (
  document: DataDoc,
  activeViewId: ViewId | undefined
): ActiveView | undefined => {
  if (!activeViewId) {
    return undefined
  }

  const view = getDocumentViewById(document, activeViewId)
  if (!view) {
    return undefined
  }

  return {
    id: view.id,
    name: view.name,
    type: view.type
  }
}
