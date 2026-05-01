import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  readCompileServices
} from '@whiteboard/core/operations/compile/helpers'
import {
  writeCanvasOrderSplice,
  writeEdgePatch,
  writeGroupCreate,
  writeGroupDelete,
  writeNodePatch,
} from './write'
import {
  toCanvasOrderAnchor,
} from '@whiteboard/core/operations/targets'

type GroupIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'group.merge'
  | 'group.order.move'
  | 'group.ungroup'
>

export const groupIntentHandlers: GroupIntentHandlers = {
  'group.merge': (ctx) => {
    const groupId = readCompileServices(ctx).ids.group()
    writeGroupCreate(ctx.program, {
      id: groupId
    })

    ctx.intent.target.nodeIds?.forEach((nodeId) => {
      writeNodePatch(ctx.program, nodeId, nodeApi.update.toPatch({
        fields: {
          groupId
        }
      }))
    })
    ctx.intent.target.edgeIds?.forEach((edgeId) => {
      writeEdgePatch(ctx.program, edgeId, {
        groupId
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
    const currentOrder = ctx.reader.canvas.order()
    const existingRefs = refs.filter((ref) => (
      currentOrder.some((entry) => entry.kind === ref.kind && entry.id === ref.id)
    ))
    if (existingRefs.length === 0) {
      return
    }
    writeCanvasOrderSplice(
      ctx.program,
      existingRefs,
      toCanvasOrderAnchor(currentOrder, existingRefs, ctx.intent.to)
    )
  },
  'group.ungroup': (ctx) => {
    const document = ctx.document
    const nodeIds: string[] = []
    const edgeIds: string[] = []

    ctx.intent.ids.forEach((groupId) => {
      const refs = ctx.reader.canvas.groupRefs(groupId)
      writeGroupDelete(ctx.program, groupId)

      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          nodeIds.push(ref.id)
          writeNodePatch(ctx.program, ref.id, nodeApi.update.toPatch({
            fields: {
              groupId: undefined
            }
          }))
          return
        }

        edgeIds.push(ref.id)
        writeEdgePatch(ctx.program, ref.id, {
          groupId: undefined
        })
      })
    })

    ctx.output({
      nodeIds,
      edgeIds
    })
  }
}
