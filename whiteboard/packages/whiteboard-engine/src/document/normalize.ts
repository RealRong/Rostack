import type { BoardConfig } from '@whiteboard/core/config'
import { document as documentApi } from '@whiteboard/core/document'
import type { Document } from '@whiteboard/core/types'
import { sanitizeDocument } from './sanitize'

export const normalizeDocument = (
  document: Document,
  _configOverrides?: Partial<BoardConfig> | BoardConfig
): Document => {
  return sanitizeDocument(
    documentApi.assert(document)
  )
}
