import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  createCanvasOrderMoveOps,
  readCompileServices,
  reorderCanvasRefs
} from '@whiteboard/core/operations/compile/helpers'

const listGroupCanvasRefs = (
  document: Pick<import('@whiteboard/core/types').Document, 'canvas' | 'nodes' | 'edges'>,
  groupId: string
) => document.canvas.order.filter((ref) => (
  ref.kind === 'node'
    ? document.nodes[ref.id]?.groupId === groupId
    : ref.kind === 'edge'
      ? document.edges[ref.id]?.groupId === groupId
      : false
))

type GroupIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'group.merge'
  | 'group.order.move'
  | 'group.ungroup'
>

export const groupIntentHandlers: GroupIntentHandlers = {
  'group.merge': (ctx) => {
    const groupId = readCompileServices(ctx).ids.group()
    ctx.emit({
      type: 'group.create',
      value: {
        id: groupId
      }
    })

    ctx.intent.target.nodeIds?.forEach((nodeId) => {
      ctx.emitMany(...nodeApi.update.createFieldsOperation(nodeId, {
        groupId
      }))
    })
    ctx.intent.target.edgeIds?.forEach((edgeId) => {
      ctx.emit({
        type: 'edge.patch',
        id: edgeId,
        patch: {
          groupId
        }
      })
    })

    ctx.output({
      groupId
    })
  },
  'group.order.move': (ctx) => {
    const refs = ctx.intent.ids.flatMap((groupId) =>
      listGroupCanvasRefs(ctx.document, groupId)
    )
    const current = ctx.document.canvas.order
    const target = reorderCanvasRefs(current, refs, ctx.intent.mode)
    createCanvasOrderMoveOps(current, target).forEach((op) => ctx.emit(op))
  },
  'group.ungroup': (ctx) => {
    const document = ctx.document
    const nodeIds: string[] = []
    const edgeIds: string[] = []

    ctx.intent.ids.forEach((groupId) => {
      const refs = listGroupCanvasRefs(document, groupId)
      ctx.emit({
        type: 'group.delete',
        id: groupId
      })

      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          nodeIds.push(ref.id)
          ctx.emitMany(...nodeApi.update.createFieldsOperation(ref.id, {
            groupId: undefined
          }))
          return
        }

        edgeIds.push(ref.id)
        ctx.emit({
          type: 'edge.patch',
          id: ref.id,
          patch: {
            groupId: undefined
          }
        })
      })
    })

    ctx.output({
      nodeIds,
      edgeIds
    })
  }
}
