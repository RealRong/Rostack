import type {
  DataDoc
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
import type {
  DocumentMutationOperationContext
} from '@dataview/core/operation/context'
import {
  DATAVIEW_OPERATION_DEFINITIONS
} from '@dataview/core/operation/definition'
import {
  createDataviewDraftDocument
} from '@dataview/core/mutation/draftDocument'
import {
  Reducer,
  type ReducerContext,
  type ReducerResult
} from '@shared/reducer'
import type {
  MutationOperationsSpec
} from '@shared/mutation'
import {
  dataviewMutationKeyConflicts,
  serializeDataviewMutationKey,
  type DataviewMutationKey
} from './key'
import {
  dataviewTrace,
  type DataviewTrace
} from './trace'

export type DataviewOperationReduceExtra = {
  trace: DataviewTrace
}

export type DataviewOperationReduceResult = ReducerResult<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  DataviewOperationReduceExtra
>

export type DataviewReduceContext = ReducerContext<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey
> & DocumentMutationOperationContext & {
  base: ReducerContext<
    DataDoc,
    DocumentOperation,
    DataviewMutationKey
  >
}

const createDataviewReduceContext = (
  ctx: ReducerContext<
    DataDoc,
    DocumentOperation,
    DataviewMutationKey
  >
): DataviewReduceContext => {
  const draftDocument = createDataviewDraftDocument(ctx.doc())

  return {
    ...ctx,
    base: ctx,
    doc: () => draftDocument.current(),
    draft: draftDocument,
    inverse: {
      prependMany: ctx.inverseMany
    },
    trace: dataviewTrace.create()
  }
}

const finalizeDataviewTrace = (
  ctx: DataviewReduceContext
): DataviewOperationReduceExtra => {
  ctx.base.replace(ctx.draft.finish())
  dataviewTrace.finalize(ctx.trace)
  return {
    trace: ctx.trace
  }
}

export const dataviewMutationOperations: MutationOperationsSpec<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  DataviewOperationReduceExtra,
  DataviewReduceContext
> = {
  table: DATAVIEW_OPERATION_DEFINITIONS,
  serializeKey: serializeDataviewMutationKey,
  createContext: createDataviewReduceContext,
  done: finalizeDataviewTrace,
  conflicts: dataviewMutationKeyConflicts
}

const dataviewOperationReducer = new Reducer<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  DataviewOperationReduceExtra,
  DataviewReduceContext
>({
  spec: {
    serializeKey: dataviewMutationOperations.serializeKey,
    createContext: dataviewMutationOperations.createContext,
    handle: (ctx, operation) => {
      const definition = dataviewMutationOperations.table[operation.type]
      definition.footprint?.(ctx, operation as never)
      definition.apply(ctx, operation as never)
    },
    done: dataviewMutationOperations.done
  }
})

export const reduceDataviewOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DataviewOperationReduceResult => dataviewOperationReducer.reduce({
  doc: document,
  ops: operations
})
