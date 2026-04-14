import type { Document } from '@whiteboard/core/types'
import { assertDocument } from '@whiteboard/core/document'
import type { RemoteDocumentChange } from '@whiteboard/collab/types/internal'
import {
  cloneJsonValue,
  isDeepEqual
} from '@whiteboard/collab/yjs/shared'

export const compileRemoteDocumentChange = (
  beforeDocument: Document,
  afterDocument: Document
): RemoteDocumentChange => {
  const before = assertDocument(beforeDocument)
  const after = assertDocument(afterDocument)

  return isDeepEqual(before, after)
    ? {
        kind: 'operations',
        operations: []
      }
    : {
        kind: 'replace',
        document: cloneJsonValue(after)
      }
}
