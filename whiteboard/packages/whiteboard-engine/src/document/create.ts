import type { Document } from '@whiteboard/core/types'
import type {
  Change,
  Facts,
  Snapshot
} from '../contracts/document'

export const createDocumentSnapshot = (input: {
  revision: number
  document: Document
  facts: Facts
  change: Change
}): Snapshot => ({
  revision: input.revision,
  state: {
    root: input.document,
    facts: input.facts
  },
  change: input.change
})
