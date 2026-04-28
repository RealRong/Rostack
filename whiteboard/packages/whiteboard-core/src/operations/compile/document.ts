import { document as documentApi, normalizeDocument } from '@whiteboard/core/document'
import type { WhiteboardIntentContext } from '@whiteboard/core/operations/compile-context'
import type { WhiteboardMutationTable } from '@whiteboard/core/operations/intent-types'
import type { MutationCompileHandlerTable } from '@shared/mutation'

const emitOps = (
  ctx: Pick<WhiteboardIntentContext, 'tx'>,
  ops: readonly import('@whiteboard/core/types').Operation[]
) => {
  ctx.tx.emitMany(ops)
}

type DocumentIntentHandlers = Pick<
  MutationCompileHandlerTable<
    WhiteboardMutationTable,
    WhiteboardIntentContext,
    'invalid' | 'cancelled'
  >,
  'document.replace'
  | 'document.insert'
  | 'document.background.set'
>

export const documentIntentHandlers: DocumentIntentHandlers = {
  'document.replace': (intent, ctx) => {
    ctx.tx.emit({
      type: 'document.replace',
      document: normalizeDocument(documentApi.assert(intent.document))
    })
  },
  'document.insert': (intent, ctx) => {
    const built = documentApi.slice.insert.ops({
      doc: ctx.tx.read.document.get(),
      slice: intent.slice,
      registries: ctx.registries,
      createNodeId: ctx.tx.ids.node,
      createEdgeId: ctx.tx.ids.edge,
      origin: intent.options?.origin,
      roots: intent.options?.roots
    })
    if (!built.ok) {
      return ctx.tx.fail.invalid(
        built.error.message,
        built.error.details
      )
    }

    emitOps(ctx, built.data.operations)
    return {
      allNodeIds: built.data.allNodeIds,
      allEdgeIds: built.data.allEdgeIds,
      roots: built.data.roots
    }
  },
  'document.background.set': (intent, ctx) => {
    ctx.tx.emit({
      type: 'document.background',
      background: intent.background
    })
  }
}
