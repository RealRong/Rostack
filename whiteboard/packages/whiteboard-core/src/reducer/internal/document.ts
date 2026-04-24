import { ok } from '@whiteboard/core/result'
import type { Document } from '@whiteboard/core/types'
import { RESET_READ_IMPACT } from './finalize'
import {
  cloneBackground,
  createChangeSet,
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
  state.shortCircuit = ok({
    doc: document,
    changes: {
      ...createChangeSet(),
      document: true,
      background: true,
      canvasOrder: true
    },
    invalidation: {
      ...createInvalidation(),
      document: true,
      background: true,
      canvasOrder: true
    },
    inverse: [],
    history: {
      footprint: []
    },
    impact: RESET_READ_IMPACT
  })
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
