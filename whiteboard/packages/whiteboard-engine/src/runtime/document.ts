import { document as documentApi } from '@whiteboard/core/document'
import type { Document } from '@whiteboard/core/types'

const assertImmutableDocumentInput = (
  currentDocument: Document,
  nextDocument: Document
) => {
  if (currentDocument !== nextDocument) {
    return
  }

  throw new Error(
    'Whiteboard engine requires immutable document inputs. Received the same document reference.'
  )
}

export type DocumentSource = {
  get: () => Document
  commit: (document: Document) => void
}

export const createDocumentSource = (
  document: Document
): DocumentSource => {
  let committedDocument = documentApi.assert(document)

  return {
    get: () => committedDocument,
    commit: (nextDocument) => {
      const committedNextDocument = documentApi.assert(nextDocument)
      assertImmutableDocumentInput(committedDocument, committedNextDocument)
      committedDocument = committedNextDocument
    }
  }
}
