import type { Document, DocumentId } from '@whiteboard/core/types'

export const createDocument = (id: DocumentId): Document => ({
  id,
  canvas: {
    order: []
  },
  nodes: {},
  edges: {},
  groups: {},
  mindmaps: {}
})
