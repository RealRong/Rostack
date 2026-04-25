import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  DocumentMutationContext
} from '@dataview/core/operation/context'
import {
  applyDataviewOperation,
  collectDataviewOperationFootprint
} from '@dataview/core/operation/definition'
import {
  createDataviewDraftDocument
} from '@dataview/core/mutation/draftDocument'
import {
  Reducer,
  type ReducerContext,
  type ReducerResult,
  type ReducerSpec
} from '@shared/reducer'
import {
  serializeDataviewMutationKey,
  type DataviewMutationKey
} from './key'
import {
  dataviewTrace,
  type DataviewTrace
} from './trace'

export type DocumentApplyExtra = {
  trace: DataviewTrace
}

export type DocumentApplyResult = ReducerResult<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  DocumentApplyExtra
>

export type DataviewReduceContext = ReducerContext<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey
> & {
  base: ReducerContext<
    DataDoc,
    DocumentOperation,
    DataviewMutationKey
  >
  doc(): DataDoc
  draft: ReturnType<typeof createDataviewDraftDocument>
  trace: DataviewTrace
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
    trace: dataviewTrace.create()
  }
}

const toDocumentMutationContext = (
  ctx: DataviewReduceContext
): DocumentMutationContext => ({
  doc: ctx.doc,
  draft: ctx.draft,
  inverse: {
    prependMany: ctx.inverseMany
  },
  trace: ctx.trace
})

const finalizeDataviewTrace = (
  ctx: DataviewReduceContext
): DocumentApplyExtra => {
  ctx.base.replace(ctx.draft.finish())
  dataviewTrace.finalize(ctx.trace)
  return {
    trace: ctx.trace
  }
}

export const dataviewReducerSpec: ReducerSpec<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  DocumentApplyExtra,
  DataviewReduceContext
> = {
  serializeKey: serializeDataviewMutationKey,
  createContext: createDataviewReduceContext,
  beforeEach: collectDataviewOperationFootprint,
  handle: (ctx, operation) => {
    applyDataviewOperation(
      toDocumentMutationContext(ctx),
      operation
    )
  },
  done: finalizeDataviewTrace
}

export const dataviewReducer = new Reducer<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  DocumentApplyExtra,
  DataviewReduceContext
>({
  spec: dataviewReducerSpec
})
