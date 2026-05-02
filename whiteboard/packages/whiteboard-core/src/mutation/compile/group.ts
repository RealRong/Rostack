import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/mutation/compile/helpers'
import {
  readCompileServices
} from '@whiteboard/core/mutation/compile/helpers'
import {
  canvasRefKey,
  toCanvasOrderAnchor,
} from '@whiteboard/core/mutation/support'

type GroupIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'group.merge'
  | 'group.order.move'
  | 'group.ungroup'
>

export const groupIntentHandlers = {
  'group.merge': (ctx) => {
    const groupId = readCompileServices(ctx).ids.group()
    ctx.writer.group.create({
      id: groupId
    })

    ctx.intent.target.nodeIds?.forEach((nodeId) => {
      ctx.writer.node.patch(nodeId, nodeApi.update.toPatch({
        fields: {
          groupId
        }
      }))
    })
    ctx.intent.target.edgeIds?.forEach((edgeId) => {
      ctx.writer.edge.patch(edgeId, {
        groupId
      })
    })

    return {
      groupId
    }
  },
  'group.order.move': (ctx) => {
    const refs = ctx.intent.ids.flatMap((groupId) => ctx.query.group.refsInOrder(groupId))
    const currentOrder = ctx.reader.document.order().items()
    const existingRefs = refs.filter((ref) => (
      currentOrder.some((entry) => entry.kind === ref.kind && entry.id === ref.id)
    ))
    if (existingRefs.length === 0) {
      return
    }
    ctx.writer.document.order().splice(
      existingRefs.map((ref) => canvasRefKey(ref)),
      toCanvasOrderAnchor(currentOrder, existingRefs, ctx.intent.to)
    )
  },
  'group.ungroup': (ctx) => {
    const document = ctx.document
    const nodeIds: string[] = []
    const edgeIds: string[] = []

    ctx.intent.ids.forEach((groupId) => {
      const refs = ctx.query.group.refsInOrder(groupId)
      ctx.writer.group.delete(groupId)

      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          nodeIds.push(ref.id)
          ctx.writer.node.patch(ref.id, nodeApi.update.toPatch({
            fields: {
              groupId: undefined
            }
          }))
          return
        }

        edgeIds.push(ref.id)
        ctx.writer.edge.patch(ref.id, {
          groupId: undefined
        })
      })
    })

    return {
      nodeIds,
      edgeIds
    }
  }
} satisfies GroupIntentHandlers
