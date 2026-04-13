import type { DataDoc, View, ViewId } from '@dataview/core/contracts'
import { getDocumentViewById, getDocumentViews } from '@dataview/core/document'

export const readDocumentViewIds = (
  document: DataDoc
): readonly ViewId[] => document.views.order

export const listDocumentViews = (
  document: DataDoc
): readonly View[] => getDocumentViews(document)

export const readDocumentView = (
  document: DataDoc,
  viewId: ViewId
): View | undefined => getDocumentViewById(document, viewId)

export const hasDocumentView = (
  document: DataDoc,
  viewId: ViewId
): boolean => Boolean(readDocumentView(document, viewId))
