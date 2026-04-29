import type {
  MutationOrigin
} from '@shared/mutation/write'
import {
  validateLockOperations
} from '@whiteboard/core/operations/lock'
import type {
  Document,
  Operation,
  ResultCode
} from '@whiteboard/core/types'

const INVALID_DOCUMENT_REPLACE_BATCH =
  'document.create must be the only operation in its batch.'

const toKernelOrigin = (
  origin: MutationOrigin
): import('@whiteboard/core/types').Origin => (
  origin === 'remote' || origin === 'system'
    ? origin
    : 'user'
)

const readLockViolationMessage = (
  reason: 'locked-node' | 'locked-edge' | 'locked-relation',
  operation: Operation
) => {
  const action = (
    operation.type === 'node.create'
    || operation.type === 'edge.create'
  )
    ? 'duplicated'
    : 'modified'

  if (reason === 'locked-node') {
    return `Locked nodes cannot be ${action}.`
  }
  if (reason === 'locked-edge') {
    return `Locked edges cannot be ${action}.`
  }
  return `Locked node relations cannot be ${action}.`
}

export const validateWhiteboardOperationBatch = (input: {
  document: Document
  operations: readonly Operation[]
  origin: MutationOrigin
}): {
  code: ResultCode
  message: string
  details?: unknown
} | undefined => {
  const hasDocumentReplace = input.operations.some((op) => op.type === 'document.create')
  if (hasDocumentReplace && input.operations.length !== 1) {
    return {
      code: 'invalid',
      message: INVALID_DOCUMENT_REPLACE_BATCH,
      details: {
        opCount: input.operations.length
      }
    }
  }

  const violation = validateLockOperations({
    document: input.document,
    operations: input.operations,
    origin: toKernelOrigin(input.origin)
  })

  return violation
    ? {
        code: 'cancelled',
        message: readLockViolationMessage(violation.reason, violation.operation),
        details: violation
      }
    : undefined
}
