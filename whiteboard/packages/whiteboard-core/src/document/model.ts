import type { Document, DocumentId } from '../types'

export const createDocument = (id: DocumentId): Document => ({
  id,
  nodes: {},
  edges: {},
  order: [],
  groups: {}
})
