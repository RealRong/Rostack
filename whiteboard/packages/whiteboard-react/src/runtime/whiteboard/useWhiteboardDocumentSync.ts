import type { MutableRefObject } from 'react'
import { useEffect } from 'react'
import type { Document } from '@whiteboard/core/types'
import { isMirroredDocumentFromEngine } from '@whiteboard/react/runtime/whiteboard/services'
import type { WhiteboardRuntimeServices } from '@whiteboard/react/runtime/whiteboard/services'

export const useWhiteboardDocumentSync = (input: {
  services: WhiteboardRuntimeServices
  document: Document
  inputDocument: Document
  lastOutboundDocumentRef: MutableRefObject<Document>
  onDocumentChange: (document: Document) => void
  viewportLimits: {
    minZoom: number
    maxZoom: number
  }
}) => {
  useEffect(() => {
    input.services.editor.write.viewport.setLimits(input.viewportLimits)
  }, [input.services.editor, input.viewportLimits])

  useEffect(() => {
    if (isMirroredDocumentFromEngine(input.document, input.inputDocument)) {
      return
    }
    if (!isMirroredDocumentFromEngine(input.lastOutboundDocumentRef.current, input.inputDocument)) {
      return
    }
    input.onDocumentChange(input.inputDocument)
  }, [
    input.document,
    input.inputDocument,
    input.lastOutboundDocumentRef,
    input.onDocumentChange
  ])

  useEffect(() => {
    if (isMirroredDocumentFromEngine(input.lastOutboundDocumentRef.current, input.inputDocument)) {
      return
    }
    input.lastOutboundDocumentRef.current = input.inputDocument
    input.services.editor.write.app.replace(input.inputDocument)
  }, [input.services.editor, input.inputDocument, input.lastOutboundDocumentRef])
}
