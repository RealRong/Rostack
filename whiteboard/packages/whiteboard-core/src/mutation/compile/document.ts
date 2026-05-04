import { document as documentApi } from '@whiteboard/core/document'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'

type DocumentIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'document.insert'
  | 'document.background.set'
>

export const documentIntentHandlers = {
  'document.insert': (ctx) => {
    const intent = ctx.intent
    const built = documentApi.slice.insert.ops({
      doc: ctx.document,
      slice: intent.slice,
      registries: ctx.services.registries,
      createNodeId: ctx.services.ids.node,
      createEdgeId: ctx.services.ids.edge,
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
    return {
      allNodeIds: built.data.allNodeIds,
      allEdgeIds: built.data.allEdgeIds,
      roots: built.data.roots
    }
  },
  'document.background.set': (ctx) => {
    ctx.writer.patch({
      background: ctx.intent.background
    })
  }
} satisfies DocumentIntentHandlers
