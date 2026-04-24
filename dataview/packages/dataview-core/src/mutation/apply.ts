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
  apply,
  type ApplyResult
} from '@shared/mutation'
import {
  collectOperationFootprint,
  serializeDataviewMutationKey,
  type DataviewMutationKey
} from './footprint'
import {
  dataviewTrace,
  type DataviewTrace
} from './trace'

export type DocumentApplyResult = ApplyResult<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  }
>

export const applyOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DocumentApplyResult => apply<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  {
    trace: DataviewTrace
  },
  {
    trace: DataviewTrace
  }
>({
  doc: document,
  ops: operations,
  serializeKey: serializeDataviewMutationKey,
  model: {
    init: () => ({
      trace: dataviewTrace.create()
    }),
    step: (ctx, operation) => {
      collectOperationFootprint(ctx, operation)
      applyOperationMutation(
        ctx,
        operation,
        ctx.state.trace
      )
    },
    done: (ctx) => {
      dataviewTrace.finalize(ctx.state.trace)
      return {
        trace: ctx.state.trace
      }
    }
  }
})
