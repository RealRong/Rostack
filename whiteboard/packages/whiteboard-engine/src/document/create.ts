import type { Document } from '@whiteboard/core/types'
import type {
  Facts,
  Snapshot
} from '../contracts/document'

export const createDocumentSnapshot = (input: {
  revision: number
  document: Document
  facts: Facts
}): Snapshot => ({
  revision: input.revision,
  state: {
    root: input.document,
    facts: input.facts
  }
})
