import { document as documentApi, normalizeDocument } from '@whiteboard/core/document'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'
import {
  readCompileRegistries,
  readCompileServices
} from '@whiteboard/core/mutation/compile/helpers'

type DocumentIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'document.replace'
  | 'document.insert'
  | 'document.background.set'
>

export const documentIntentHandlers: DocumentIntentHandlers = {
  'document.replace': (ctx) => {
    const intent = ctx.intent
    ctx.writer.document.create(
      normalizeDocument(documentApi.assert(intent.document))
    )
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
      return ctx.invalid(
        built.error.message,
        built.error.details
      )
    }

    built.data.nodes.forEach((node) => {
      ctx.writer.node.create(node)
    })
    built.data.edges.forEach((edge) => {
      ctx.writer.edge.create(edge)
    })
    ctx.output({
      allNodeIds: built.data.allNodeIds,
      allEdgeIds: built.data.allEdgeIds,
      roots: built.data.roots
    })
  },
  'document.background.set': (ctx) => {
    ctx.writer.document.patch({
      background: ctx.intent.background
    })
  }
}
