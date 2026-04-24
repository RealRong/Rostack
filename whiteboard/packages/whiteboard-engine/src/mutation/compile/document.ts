import { document as documentApi } from '@whiteboard/core/document'
import type { DocumentCommand } from '../../types/command'
import { normalizeDocument } from '../../document/normalize'
import type { CommandCompileContext } from '../types'

const emitOps = (
  ctx: Pick<CommandCompileContext, 'tx'>,
  ops: readonly import('@whiteboard/core/types').Operation[]
) => {
  ctx.tx.emitMany(ops)
}

export const compileDocumentCommand = (
  command: DocumentCommand,
  ctx: CommandCompileContext
) => {
  switch (command.type) {
    case 'document.replace':
      ctx.tx.emit({
        type: 'document.replace',
        document: normalizeDocument(documentApi.assert(command.document))
      })
      return
    case 'document.insert': {
      const built = documentApi.slice.buildInsertOps({
        doc: ctx.tx.read.document.get(),
        slice: command.slice,
        nodeSize: ctx.nodeSize,
        registries: ctx.registries,
        createNodeId: ctx.tx.ids.node,
        createEdgeId: ctx.tx.ids.edge,
        origin: command.options?.origin,
        roots: command.options?.roots
      })
      if (!built.ok) {
        return ctx.tx.fail.invalid(
          built.error.message,
          built.error.details
        )
      }

      emitOps(ctx, built.data.operations)
      return {
        nodeIds: built.data.allNodeIds,
        edgeIds: built.data.allEdgeIds,
        roots: built.data.roots
      }
    }
    case 'document.background.set':
      ctx.tx.emit({
        type: 'document.background',
        background: command.background
      })
      return
  }
}
