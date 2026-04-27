import { document as documentApi, normalizeDocument } from '@whiteboard/core/document'
import type { WhiteboardIntentContext } from '@whiteboard/core/operations/compile-context'
import type { DocumentIntent } from '@whiteboard/core/operations/intent-types'

const emitOps = (
  ctx: Pick<WhiteboardIntentContext, 'tx'>,
  ops: readonly import('@whiteboard/core/types').Operation[]
) => {
  ctx.tx.emitMany(ops)
}

export const compileDocumentIntent = (
  intent: DocumentIntent,
  ctx: WhiteboardIntentContext
) => {
  switch (intent.type) {
    case 'document.replace':
      ctx.tx.emit({
        type: 'document.replace',
        document: normalizeDocument(documentApi.assert(intent.document))
      })
      return
    case 'document.insert': {
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
    }
    case 'document.background.set':
      ctx.tx.emit({
        type: 'document.background',
        background: intent.background
      })
      return
  }
}
