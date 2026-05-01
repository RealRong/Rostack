import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  appendWhiteboardOperation,
  appendWhiteboardOperations
} from './append'
import {
  readCompileServices
} from '@whiteboard/core/operations/compile/helpers'

type GroupIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'group.merge'
  | 'group.order.move'
  | 'group.ungroup'
>

export const groupIntentHandlers: GroupIntentHandlers = {
  'group.merge': (ctx) => {
    const groupId = readCompileServices(ctx).ids.group()
    appendWhiteboardOperation(ctx, {
      type: 'group.create',
      value: {
        id: groupId
      }
    })

    ctx.intent.target.nodeIds?.forEach((nodeId) => {
      appendWhiteboardOperations(ctx, ...nodeApi.update.createFieldsOperation(nodeId, {
        groupId
      }))
    })
    ctx.intent.target.edgeIds?.forEach((edgeId) => {
      appendWhiteboardOperation(ctx, {
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
      ctx.reader.canvas.groupRefs(groupId)
    )
    appendWhiteboardOperation(ctx, {
      type: 'canvas.order.move',
      refs,
      to: ctx.intent.to
    })
  },
  'group.ungroup': (ctx) => {
    const document = ctx.document
    const nodeIds: string[] = []
    const edgeIds: string[] = []

    ctx.intent.ids.forEach((groupId) => {
      const refs = ctx.reader.canvas.groupRefs(groupId)
      appendWhiteboardOperation(ctx, {
        type: 'group.delete',
        id: groupId
      })

      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          nodeIds.push(ref.id)
          appendWhiteboardOperations(ctx, ...nodeApi.update.createFieldsOperation(ref.id, {
            groupId: undefined
          }))
          return
        }

        edgeIds.push(ref.id)
        appendWhiteboardOperation(ctx, {
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
