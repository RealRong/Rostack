import type { Document } from '@whiteboard/core/types'
import {
  cloneBackground,
  createChangeSet,
  createDraftDocument,
  createInvalidation,
  markBackgroundTouched,
  materializeDraftDocument,
  type WhiteboardReduceState
} from './state'

export const replaceDocument = (
  state: WhiteboardReduceState,
  document: Document
): void => {
  state.inverse.prepend({
    type: 'document.replace',
    document: materializeDraftDocument(state.draft)
  })
  state.draft = createDraftDocument(document)
  state.changes = {
    ...createChangeSet(),
    document: true,
    background: true,
    canvasOrder: true
  }
  state.invalidation = {
    ...createInvalidation(),
    document: true,
    background: true,
    canvasOrder: true
  }
  state.replaced = true
  state.queue.mindmapLayout = []
  state.queue.mindmapLayoutSet.clear()
}

export const setDocumentBackground = (
  state: WhiteboardReduceState,
  background: Document['background']
): void => {
  state.inverse.prepend({
    type: 'document.background',
    background: cloneBackground(state.draft.background)
  })
  state.draft.background = background
  markBackgroundTouched(state)
}
