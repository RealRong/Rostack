import type { BoardConfig } from '@whiteboard/core/config'
import {
  assertDocument,
  type Document
} from '@whiteboard/core/types'
import { sanitizeDocument } from './normalize/sanitize'

export const normalizeDocument = (
  document: Document,
  _configOverrides?: Partial<BoardConfig> | BoardConfig
): Document => {
  return sanitizeDocument(
    assertDocument(document)
  )
}
