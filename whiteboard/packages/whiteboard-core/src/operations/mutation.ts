import type {
  MutationIntentTable,
  MutationOrigin
} from '@shared/mutation'
import {
  MutationEngine
} from '@shared/mutation'
import {
  createId
} from '@shared/core'
import {
  normalizeDocument
} from '@whiteboard/core/document'
import {
  createRegistries
} from '@whiteboard/core/registry'
import type {
  WhiteboardCompileServices
} from '@whiteboard/core/operations/compile'
import {
  whiteboardCustom
} from '@whiteboard/core/operations/custom'
import {
  whiteboardEntities
} from '@whiteboard/core/operations/entities'
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

const createWhiteboardServices = (): WhiteboardCompileServices => ({
  ids: {
    node: () => createId('node'),
    edge: () => createId('edge'),
    edgeLabel: () => createId('edge_label'),
    edgeRoutePoint: () => createId('edge_point'),
    group: () => createId('group'),
    mindmap: () => createId('mindmap')
  },
  registries: createRegistries()
})

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

type WhiteboardApplyResult = ReturnType<
  MutationEngine<
    Document,
    MutationIntentTable,
    Operation,
    WhiteboardCompileServices,
    ResultCode
  >['apply']
>

export const reduceWhiteboardOperations = (input: {
  document: Document
  operations: readonly Operation[]
  origin: MutationOrigin
}): WhiteboardApplyResult => {
  const invalid = validateWhiteboardOperationBatch(input)
  if (invalid) {
    return {
      ok: false as const,
      error: invalid
    }
  }

  const engine = new MutationEngine<
    Document,
    MutationIntentTable,
    Operation,
    WhiteboardCompileServices,
    ResultCode
  >({
    document: input.document,
    normalize: normalizeDocument,
    services: createWhiteboardServices(),
    entities: whiteboardEntities,
    custom: whiteboardCustom,
    history: false
  })

  return engine.apply(input.operations, {
    origin: input.origin
  })
}

export {
  whiteboardCustom
}
