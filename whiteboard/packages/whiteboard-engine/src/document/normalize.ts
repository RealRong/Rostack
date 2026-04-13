import type { BoardConfig } from '@whiteboard/core/config'
import { assertDocument } from '@whiteboard/core/document'
import type { Document } from '@whiteboard/core/types'
import { sanitizeDocument } from '#whiteboard-engine/document/sanitize'

export const normalizeDocument = (
  document: Document,
  _configOverrides?: Partial<BoardConfig> | BoardConfig
): Document => {
  return sanitizeDocument(
    assertDocument(document)
  )
}
