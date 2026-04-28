import { document as documentApi, normalizeDocument } from '@whiteboard/core/document'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  failInvalid,
  readCompileRegistries,
  readCompileServices
} from '@whiteboard/core/operations/compile/helpers'

const emitOps = (
  ctx: Pick<WhiteboardCompileContext, 'emitMany'>,
  ops: readonly import('@whiteboard/core/types').Operation[]
) => {
  ctx.emitMany(...ops)
}

type DocumentIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'document.replace'
  | 'document.insert'
  | 'document.background.set'
>

export const documentIntentHandlers: DocumentIntentHandlers = {
  'document.replace': (ctx) => {
    const intent = ctx.intent
    ctx.emit({
      type: 'document.create',
      value: normalizeDocument(documentApi.assert(intent.document))
    })
  },
  'document.insert': (ctx) => {
    const intent = ctx.intent
    const built = documentApi.slice.insert.ops({
      doc: ctx.document,
      slice: intent.slice,
      registries: readCompileRegistries(ctx),
      createNodeId: readCompileServices(ctx).ids.node,
      createEdgeId: readCompileServices(ctx).ids.edge,
      origin: intent.options?.origin,
      roots: intent.options?.roots
    })
    if (!built.ok) {
      return failInvalid(
        ctx,
        built.error.message,
        built.error.details
      )
    }

    emitOps(ctx, built.data.operations)
    ctx.output({
      allNodeIds: built.data.allNodeIds,
      allEdgeIds: built.data.allEdgeIds,
      roots: built.data.roots
    })
  },
  'document.background.set': (ctx) => {
    ctx.emit({
      type: 'document.patch',
      patch: {
        background: ctx.intent.background
      }
    })
  }
}
