import { document as documentApi, normalizeDocument } from '@whiteboard/core/document'
import type { WhiteboardCompileScope } from '@whiteboard/core/operations/compile/scope'
import type { WhiteboardMutationTable } from '@whiteboard/core/operations/intent-types'
import type { MutationCompileHandlerTable } from '@shared/mutation'

const emitOps = (
  ctx: Pick<WhiteboardCompileScope, 'emitMany'>,
  ops: readonly import('@whiteboard/core/types').Operation[]
) => {
  ctx.emitMany(ops)
}

type DocumentIntentHandlers = Pick<
  MutationCompileHandlerTable<
    WhiteboardMutationTable,
    WhiteboardCompileScope,
    'invalid' | 'cancelled'
  >,
  'document.replace'
  | 'document.insert'
  | 'document.background.set'
>

export const documentIntentHandlers: DocumentIntentHandlers = {
  'document.replace': (intent, ctx) => {
    ctx.emit({
      type: 'document.replace',
      document: normalizeDocument(documentApi.assert(intent.document))
    })
  },
  'document.insert': (intent, ctx) => {
    const built = documentApi.slice.insert.ops({
      doc: ctx.read.document(),
      slice: intent.slice,
      registries: ctx.registries,
      createNodeId: ctx.ids.node,
      createEdgeId: ctx.ids.edge,
      origin: intent.options?.origin,
      roots: intent.options?.roots
    })
    if (!built.ok) {
      return ctx.fail.invalid(
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
    ctx.emit({
      type: 'document.background',
      background: intent.background
    })
  }
}
