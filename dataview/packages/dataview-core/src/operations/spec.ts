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
  MutationFootprint,
  MutationReduceSpec
} from '@shared/mutation'
import type { ValidationCode } from './contracts'
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
  MutationFootprint,
  DataviewOperationReduceExtra
>

export type DataviewReduceContext = ReducerContext<
  DataDoc,
  DocumentOperation,
  MutationFootprint
> & DocumentMutationOperationContext & {
  base: ReducerContext<
    DataDoc,
    DocumentOperation,
    MutationFootprint
  >
}

const createDataviewReduceContext = (
  ctx: ReducerContext<
    DataDoc,
    DocumentOperation,
    MutationFootprint
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
  MutationFootprint,
  DataviewOperationReduceExtra,
  DataviewReduceContext,
  ValidationCode
> = {
  createContext: createDataviewReduceContext,
  done: finalizeDataviewTrace
}
