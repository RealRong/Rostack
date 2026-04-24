import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import {
  applyOperationMutation
} from '@dataview/core/operation/mutation'
import {
  Reducer,
  type ReducerContext,
  type ReducerResult
} from '@shared/reducer'
import {
  collectOperationFootprint,
  serializeDataviewMutationKey,
  type DataviewMutationKey
} from './footprint'
import {
  dataviewTrace,
  type DataviewTrace
} from './trace'

export type DocumentApplyResult = ReducerResult<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  }
>

type DataviewReduceContext = ReducerContext<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey
> & {
  trace: DataviewTrace
}

const applyDataviewOperation = (
  ctx: DataviewReduceContext,
  operation: DocumentOperation
) => {
  collectOperationFootprint(ctx, operation)
  applyOperationMutation({
    doc: ctx.doc,
    replace: ctx.replace,
    inverse: {
      prependMany: ctx.inverseMany
    }
  }, operation, ctx.trace)
}

const dataviewReducer = new Reducer<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  },
  DataviewReduceContext
>({
  spec: {
    serializeKey: serializeDataviewMutationKey,
    createContext: (ctx) => ({
      ...ctx,
      trace: dataviewTrace.create()
    }),
    handlers: {
      'document.record.insert': applyDataviewOperation,
      'document.record.patch': applyDataviewOperation,
      'document.record.remove': applyDataviewOperation,
      'document.record.fields.writeMany': applyDataviewOperation,
      'document.record.fields.restoreMany': applyDataviewOperation,
      'document.field.put': applyDataviewOperation,
      'document.field.patch': applyDataviewOperation,
      'document.field.remove': applyDataviewOperation,
      'document.view.put': applyDataviewOperation,
      'document.activeView.set': applyDataviewOperation,
      'document.view.remove': applyDataviewOperation,
      'external.version.bump': applyDataviewOperation
    },
    done: (ctx) => {
      dataviewTrace.finalize(ctx.trace)
      return {
        trace: ctx.trace
      }
    }
  }
})

export const applyOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DocumentApplyResult => dataviewReducer.reduce({
  doc: document,
  ops: operations
}) as DocumentApplyResult
