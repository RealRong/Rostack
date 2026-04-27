import { Reducer } from '@shared/reducer'
import type { HistoryFootprint } from '@whiteboard/core/operations/history'
import {
  definitions,
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
  Operation
} from '@whiteboard/core/types'

const whiteboardOperationReducer = new Reducer<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardOperationReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
>({
  spec: {
    serializeKey: spec.serializeKey,
    createContext: spec.createContext,
    handle: (ctx, operation) => {
      const definition = definitions[operation.type]
      definition.footprint?.(ctx, operation as never)
      definition.apply(ctx, operation as never)
    },
    settle: spec.settle,
    done: spec.done
  }
})

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

  return whiteboardOperationReducer.reduce(input)
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
