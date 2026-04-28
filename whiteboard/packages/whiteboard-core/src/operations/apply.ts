import {
  reduceWhiteboardOperations
} from '@whiteboard/core/operations/mutation'
import {
  RESET_READ_IMPACT,
  deriveImpact,
  summarizeInvalidation
} from '@whiteboard/core/reducer/extra'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'

export const apply = (input: {
  doc: Document
  ops: readonly Operation[]
  origin?: string
}) => reduceWhiteboardOperations({
  document: input.doc,
  operations: input.ops,
  origin: input.origin === 'remote' || input.origin === 'system'
    ? input.origin
    : 'user'
})

export {
  RESET_READ_IMPACT,
  deriveImpact,
  summarizeInvalidation
}
