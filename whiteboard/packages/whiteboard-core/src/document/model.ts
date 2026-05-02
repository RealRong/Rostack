import type { Document, DocumentId } from '@whiteboard/core/types'

export const createDocument = (id: DocumentId): Document => ({
  id,
  order: [],
  nodes: {},
  edges: {},
  groups: {},
  mindmaps: {}
})
