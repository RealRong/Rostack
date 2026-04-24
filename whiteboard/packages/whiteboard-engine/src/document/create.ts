import type { Document } from '@whiteboard/core/types'
import type { Snapshot } from '../contracts/document'

export const createDocumentSnapshot = (input: {
  revision: number
  document: Document
}): Snapshot => ({
  revision: input.revision,
  document: input.document
})
