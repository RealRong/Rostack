import { document as documentApi } from '@whiteboard/core/document'
import type { Document } from '@whiteboard/core/types'
import { sanitizeDocument } from './sanitize'

export const normalizeDocument = (
  document: Document
): Document => {
  return documentApi.assert(
    sanitizeDocument(document)
  )
}
