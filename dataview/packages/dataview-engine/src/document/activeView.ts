import type { DataDoc, View, ViewId } from '@dataview/core/contracts'
import {
  getDocumentActiveView,
  getDocumentActiveViewId
} from '@dataview/core/document'

export const readActiveViewId = (
  document: DataDoc
): ViewId | undefined => getDocumentActiveViewId(document)

export const readActiveView = (
  document: DataDoc
): View | undefined => getDocumentActiveView(document)
