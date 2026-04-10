import type { EngineDocument } from '@engine-types/instance'
import { assertDocument } from '@whiteboard/core/document'
import type { Document } from '@whiteboard/core/types'

const assertImmutableDocumentInput = (
  currentDocument: Document,
  nextDocument: Document
) => {
  if (currentDocument !== nextDocument) return
  throw new Error(
    'Whiteboard engine requires immutable document inputs. Received the same document reference.'
  )
}

export const createDocumentSource = (document: Document): EngineDocument => {
  let committedDocument = assertDocument(document)

  const get = () => committedDocument

  const commit = (nextDocument: Document) => {
    const committedNextDocument = assertDocument(nextDocument)
    assertImmutableDocumentInput(committedDocument, committedNextDocument)
    committedDocument = committedNextDocument
  }

  return {
    get,
    commit
  }
}
