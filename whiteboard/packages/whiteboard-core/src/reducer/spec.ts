import {
  Reducer,
  type ReducerSpec
} from '@shared/reducer'
import {
  validateLockOperations
} from '@whiteboard/core/lock'
import {
  serializeHistoryKey,
  type HistoryFootprint
} from '@whiteboard/core/spec/history'
import type {
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'
import {
  createWhiteboardReduceContext
} from './context'
import {
  finishWhiteboardReduce,
  readLockViolationMessage
} from './extra'
import {
  reduceDocumentOperation
} from './handlers/document'
import {
  reduceEdgeOperation
} from './handlers/edge'
import {
  reduceGroupOperation
} from './handlers/group'
import {
  reduceMindmapOperation
} from './handlers/mindmap'
import {
  reduceNodeOperation
} from './handlers/node'
import {
  collectWhiteboardHistory
} from './history'
import type {
  WhiteboardReduceCtx,
  WhiteboardReduceResult,
  WhiteboardReduceExtra,
  WhiteboardReduceIssueCode
} from './types'

const INVALID_DOCUMENT_REPLACE_BATCH =
  'document.replace must be the only operation in its batch.'

const toKernelOrigin = (
  origin: string | undefined
): Origin => (
  origin === 'remote' || origin === 'system'
    ? origin
    : 'user'
)

const failReduce = (
  code: WhiteboardReduceIssueCode,
  message: string,
  details?: unknown
) => ({
  ok: false as const,
  error: {
    code,
    message,
    ...(details === undefined
      ? {}
      : {
          details
        })
  }
})

const validateWhiteboardReduceInput = (input: {
  doc: Document
  ops: readonly Operation[]
  origin?: string
}) => {
  const hasDocumentReplace = input.ops.some((op) => op.type === 'document.replace')
  if (hasDocumentReplace && input.ops.length !== 1) {
    return failReduce('invalid', INVALID_DOCUMENT_REPLACE_BATCH, {
      opCount: input.ops.length
    })
  }

  const violation = validateLockOperations({
    document: input.doc,
    operations: input.ops,
    origin: toKernelOrigin(input.origin)
  })

  return violation
    ? failReduce(
        'cancelled',
        readLockViolationMessage(violation.reason, violation.operation),
        violation
      )
    : undefined
}

const handleWhiteboardOperation = (
  ctx: WhiteboardReduceCtx,
  op: Operation
) => {
  if (
    op.type === 'document.replace'
    || op.type === 'document.background'
    || op.type === 'canvas.order.move'
  ) {
    reduceDocumentOperation(ctx, op)
    return
  }

  if (op.type.startsWith('node.')) {
    reduceNodeOperation(ctx, op as Parameters<typeof reduceNodeOperation>[1])
    return
  }

  if (op.type.startsWith('edge.')) {
    reduceEdgeOperation(ctx, op as Parameters<typeof reduceEdgeOperation>[1])
    return
  }

  if (op.type.startsWith('group.')) {
    reduceGroupOperation(ctx, op as Parameters<typeof reduceGroupOperation>[1])
    return
  }

  if (op.type.startsWith('mindmap.')) {
    reduceMindmapOperation(ctx, op as Parameters<typeof reduceMindmapOperation>[1])
    return
  }

  ctx.fail('invalid', `Unsupported operation: ${op.type}`)
}

export const whiteboardReducerSpec: ReducerSpec<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
> = {
  serializeKey: serializeHistoryKey,
  createContext: createWhiteboardReduceContext,
  beforeEach: (ctx, op) => {
    collectWhiteboardHistory(ctx, op)
  },
  handle: handleWhiteboardOperation,
  settle: (ctx) => {
    ctx.mindmap.flush()
  },
  done: finishWhiteboardReduce
}

const whiteboardReducerKernel = new Reducer<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
>({
  spec: whiteboardReducerSpec
})

export const whiteboardReducer = {
  reduce: (input: {
    doc: Document
    ops: readonly Operation[]
    origin?: string
  }): WhiteboardReduceResult => {
    const invalid = validateWhiteboardReduceInput(input)
    if (invalid) {
      return invalid
    }
    return whiteboardReducerKernel.reduce(input)
  }
} as const
