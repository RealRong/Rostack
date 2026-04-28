import { OperationMutationRuntime } from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/operations/history'
import {
  type WhiteboardOperationReduceExtra,
  type WhiteboardOperationReduceResult
} from '@whiteboard/core/operations/definitions'
import {
  spec,
  validateWhiteboardOperations
} from '@whiteboard/core/operations/spec'
import {
  RESET_READ_IMPACT,
  deriveImpact,
  summarizeInvalidation
} from '@whiteboard/core/reducer/extra'
import type {
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
} from '@whiteboard/core/reducer/types'
import type {
  Document,
  Origin,
  Operation
} from '@whiteboard/core/types'

const toMutationOrigin = (
  origin: string | undefined
): Origin => (
  origin === 'remote' || origin === 'system'
    ? origin
    : 'user'
)

export const apply = (input: {
  doc: Document
  ops: readonly Operation[]
  origin?: string
}): WhiteboardOperationReduceResult => {
  const invalid = validateWhiteboardOperations(input)
  if (invalid) {
    return {
      ok: false,
      error: invalid
      }
  }

  return OperationMutationRuntime.reduce({
    doc: input.doc,
    ops: input.ops,
    origin: toMutationOrigin(input.origin),
    operations: spec
  })
}

export {
  RESET_READ_IMPACT,
  deriveImpact,
  summarizeInvalidation
}

export type {
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
} from '@whiteboard/core/reducer/types'
