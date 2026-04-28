import { document as documentApi, normalizeDocument } from '@whiteboard/core/document'
import {
  createDocumentPatch
} from '@whiteboard/core/operations/patch'
import type { WhiteboardScopedIntentHandlers } from '@whiteboard/core/operations/compile/contracts'
import type { WhiteboardCompileScope } from '@whiteboard/core/operations/compile/scope'

const emitOps = (
  ctx: Pick<WhiteboardCompileScope, 'emitMany'>,
  ops: readonly import('@whiteboard/core/types').Operation[]
) => {
  ctx.emitMany(ops)
}

type DocumentIntentHandlers = Pick<
  WhiteboardScopedIntentHandlers,
  'document.replace'
  | 'document.insert'
  | 'document.background.set'
>

export const documentIntentHandlers: DocumentIntentHandlers = {
  'document.replace': (intent, ctx) => {
    ctx.emit({
      type: 'document.create',
      value: normalizeDocument(documentApi.assert(intent.document))
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
      type: 'document.patch',
      patch: createDocumentPatch({
        background: intent.background
      })
    })
  }
}
