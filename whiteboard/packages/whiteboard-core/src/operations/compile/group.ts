import type { WhiteboardCompileScope } from '@whiteboard/core/operations/compile/scope'
import type { WhiteboardMutationTable } from '@whiteboard/core/operations/intent-types'
import { groupOrderMove } from '@whiteboard/core/operations/plan'
import type { MutationCompileHandlerTable } from '@shared/mutation'

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
  MutationCompileHandlerTable<
    WhiteboardMutationTable,
    WhiteboardCompileScope,
    'invalid' | 'cancelled'
  >,
  'group.merge'
  | 'group.order.move'
  | 'group.ungroup'
>

export const groupIntentHandlers: GroupIntentHandlers = {
  'group.merge': (intent, ctx) => {
    const groupId = ctx.ids.group()
    ctx.emit({
      type: 'group.create',
      group: {
        id: groupId
      }
    })

    intent.target.nodeIds?.forEach((nodeId) => {
      ctx.emit({
        type: 'node.patch',
        id: nodeId,
        fields: {
          groupId
        }
      })
    })
    intent.target.edgeIds?.forEach((edgeId) => {
      ctx.emit({
        type: 'edge.patch',
        id: edgeId,
        fields: {
          groupId
        }
      })
    })

    return {
      groupId
    }
  },
  'group.order.move': (intent, ctx) => {
    const document = ctx.read.document()
    groupOrderMove({
      document,
      ids: intent.ids,
      mode: intent.mode
    }).forEach((op) => ctx.emit(op))
  },
  'group.ungroup': (intent, ctx) => {
    const document = ctx.read.document()
    const nodeIds: string[] = []
    const edgeIds: string[] = []

    intent.ids.forEach((groupId) => {
      const refs = listGroupCanvasRefs(document, groupId)
      ctx.emit({
        type: 'group.delete',
        id: groupId
      })

      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          nodeIds.push(ref.id)
          ctx.emit({
            type: 'node.patch',
            id: ref.id,
            fields: {
              groupId: undefined
            }
          })
          return
        }

        edgeIds.push(ref.id)
        ctx.emit({
          type: 'edge.patch',
          id: ref.id,
          fields: {
            groupId: undefined
          }
        })
      })
    })

    return {
      nodeIds,
      edgeIds
    }
  }
}
