import type { DataDoc } from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import type { DocumentMutationOperationContext } from './internal/context'
import { DATAVIEW_OPERATION_DEFINITIONS } from './definitions'
import { createDataviewDraftDocument } from './internal/draft'
import {
  type ReducerContext,
  type ReducerResult
} from '@shared/reducer'
import type {
  MutationReduceSpec
} from '@shared/mutation'
import type {
  DataviewMutationKey,
  ValidationCode
} from './contracts'
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

export const dataviewOperationTable = DATAVIEW_OPERATION_DEFINITIONS

export const dataviewReduceSpec: MutationReduceSpec<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  DataviewOperationReduceExtra,
  DataviewReduceContext,
  ValidationCode
> = {
  createContext: createDataviewReduceContext,
  done: finalizeDataviewTrace
}
