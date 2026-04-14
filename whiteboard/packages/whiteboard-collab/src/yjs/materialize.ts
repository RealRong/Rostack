import type { Document } from '@whiteboard/core/types'
import * as Y from 'yjs'
import {
  COLLAB_DOCUMENT_KEY,
  cloneJsonValue,
  getCollabRoot,
  readDocumentLikeFromYDoc,
  toYValue,
  writeSchemaVersion
} from '@whiteboard/collab/yjs/shared'

export const hasYjsDocumentSnapshot = (
  doc: Y.Doc
): boolean => {
  try {
    return Boolean(readDocumentLikeFromYDoc(doc))
  } catch {
    return false
  }
}

export const materializeYjsDocument = (
  doc: Y.Doc
): Document | undefined => readDocumentLikeFromYDoc(doc)

export const replaceYjsDocument = (
  doc: Y.Doc,
  snapshot: Document
) => {
  const root = getCollabRoot(doc)
  writeSchemaVersion(doc)
  root.set(COLLAB_DOCUMENT_KEY, toYValue(cloneJsonValue(snapshot)))
}
