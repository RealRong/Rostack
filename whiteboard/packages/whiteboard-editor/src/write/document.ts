import type {
  Document
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { DocumentWrite } from '@whiteboard/editor/write/types'

export const createDocumentWrite = (
  engine: Engine
): DocumentWrite => ({
  replace: (document: Document) => engine.execute({
    type: 'document.replace',
    document
  }),
  insert: (slice, options) => engine.execute({
    type: 'document.insert',
    slice,
    options
  }),
  background: {
    set: (background) => engine.execute({
      type: 'document.background.set',
      background
    })
  }
})
