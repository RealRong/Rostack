import { useEffect } from 'react'
import type { Document } from '@whiteboard/core/types'
import type { WhiteboardInstance as Editor } from '../../types/runtime'
import { isMirroredDocumentFromEngine } from './runtime'

export const DocumentSync = ({
  editor,
  document,
  inputDocument,
  lastOutboundDocumentRef,
  onDocumentChangeRef
}: {
  editor: Editor
  document: Document
  inputDocument: Document
  lastOutboundDocumentRef: {
    current: Document
  }
  onDocumentChangeRef: {
    current: (document: Document) => void
  }
}) => {
  useEffect(() => {
    if (isMirroredDocumentFromEngine(document, inputDocument)) {
      return
    }
    if (!isMirroredDocumentFromEngine(lastOutboundDocumentRef.current, inputDocument)) {
      return
    }
    onDocumentChangeRef.current(inputDocument)
  }, [document, inputDocument, lastOutboundDocumentRef, onDocumentChangeRef])

  useEffect(() => {
    if (isMirroredDocumentFromEngine(lastOutboundDocumentRef.current, inputDocument)) {
      return
    }
    lastOutboundDocumentRef.current = inputDocument
    editor.commands.document.replace(inputDocument)
  }, [editor, inputDocument, lastOutboundDocumentRef])

  return null
}
