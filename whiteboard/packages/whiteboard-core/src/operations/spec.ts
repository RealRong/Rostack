import type { MutationOperationsSpec } from '@shared/mutation'
import type { ReducerContext } from '@shared/reducer'
import {
  historyKeyConflicts,
  serializeHistoryKey,
  type HistoryFootprint
} from '@whiteboard/core/operations/history'
import { validateLockOperations } from '@whiteboard/core/operations/lock'
import {
  definitions,
  type WhiteboardOperationReduceExtra
} from '@whiteboard/core/operations/definitions'
import {
  createWhiteboardReduceContext
} from '@whiteboard/core/reducer/context'
import {
  finishWhiteboardReduce,
  readLockViolationMessage
} from '@whiteboard/core/reducer/extra'
import type {
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
} from '@whiteboard/core/reducer/types'
import type {
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'

const INVALID_DOCUMENT_REPLACE_BATCH =
  'document.replace must be the only operation in its batch.'

const toKernelOrigin = (
  origin: string | undefined
): Origin => (
  origin === 'remote' || origin === 'system'
    ? origin
    : 'user'
)

export const validateWhiteboardOperations = (input: {
  doc: Document
  ops: readonly Operation[]
  origin?: string
}) => {
  const hasDocumentReplace = input.ops.some((op) => op.type === 'document.replace')
  if (hasDocumentReplace && input.ops.length !== 1) {
    return {
      code: 'invalid' as WhiteboardReduceIssueCode,
      message: INVALID_DOCUMENT_REPLACE_BATCH,
      details: {
        opCount: input.ops.length
      }
    }
  }

  const violation = validateLockOperations({
    document: input.doc,
    operations: input.ops,
    origin: toKernelOrigin(input.origin)
  })

  return violation
    ? {
        code: 'cancelled' as WhiteboardReduceIssueCode,
        message: readLockViolationMessage(violation.reason, violation.operation),
        details: violation
      }
    : undefined
}

export const spec: MutationOperationsSpec<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardOperationReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
> = {
  table: definitions,
  serializeKey: serializeHistoryKey,
  createContext: createWhiteboardReduceContext as (
    ctx: ReducerContext<
      Document,
      Operation,
      HistoryFootprint[number],
      WhiteboardReduceIssueCode
    >
  ) => WhiteboardReduceCtx,
  validate: ({
    doc,
    ops,
    origin
  }) => validateWhiteboardOperations({
    doc,
    ops,
    origin
  }),
  settle: (ctx) => {
    ctx.mindmap.flush()
  },
  done: finishWhiteboardReduce,
  conflicts: historyKeyConflicts
}
