import { document as documentApi, normalizeDocument } from '@whiteboard/core/document'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  appendWhiteboardOperation,
  appendWhiteboardOperations
} from './append'
import {
  failInvalid,
  readCompileRegistries,
  readCompileServices
} from '@whiteboard/core/operations/compile/helpers'

type DocumentIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'document.replace'
  | 'document.insert'
  | 'document.background.set'
>

export const documentIntentHandlers: DocumentIntentHandlers = {
  'document.replace': (ctx) => {
    const intent = ctx.intent
    appendWhiteboardOperation(ctx, {
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

    appendWhiteboardOperations(ctx, ...built.data.operations)
    ctx.output({
      allNodeIds: built.data.allNodeIds,
      allEdgeIds: built.data.allEdgeIds,
      roots: built.data.roots
    })
  },
  'document.background.set': (ctx) => {
    appendWhiteboardOperation(ctx, {
      type: 'document.patch',
      patch: {
        background: ctx.intent.background
      }
    })
  }
}
