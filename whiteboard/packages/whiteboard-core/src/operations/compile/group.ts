import type { WhiteboardIntentContext } from '@whiteboard/core/operations/compile-context'
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
    WhiteboardIntentContext,
    'invalid' | 'cancelled'
  >,
  'group.merge'
  | 'group.order.move'
  | 'group.ungroup'
>

export const groupIntentHandlers: GroupIntentHandlers = {
  'group.merge': (intent, ctx) => {
    const groupId = ctx.tx.ids.group()
    ctx.tx.emit({
      type: 'group.create',
      group: {
        id: groupId
      }
    })

    intent.target.nodeIds?.forEach((nodeId) => {
      ctx.tx.emit({
        type: 'node.field.set',
        id: nodeId,
        field: 'groupId',
        value: groupId
      })
    })
    intent.target.edgeIds?.forEach((edgeId) => {
      ctx.tx.emit({
        type: 'edge.field.set',
        id: edgeId,
        field: 'groupId',
        value: groupId
      })
    })

    return {
      groupId
    }
  },
  'group.order.move': (intent, ctx) => {
    const document = ctx.tx.read.document.get()
    groupOrderMove({
      document,
      ids: intent.ids,
      mode: intent.mode
    }).forEach((op) => ctx.tx.emit(op))
  },
  'group.ungroup': (intent, ctx) => {
    const document = ctx.tx.read.document.get()
    const nodeIds: string[] = []
    const edgeIds: string[] = []

    intent.ids.forEach((groupId) => {
      const refs = listGroupCanvasRefs(document, groupId)
      ctx.tx.emit({
        type: 'group.delete',
        id: groupId
      })

      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          nodeIds.push(ref.id)
          ctx.tx.emit({
            type: 'node.field.unset',
            id: ref.id,
            field: 'groupId'
          })
          return
        }

        edgeIds.push(ref.id)
        ctx.tx.emit({
          type: 'edge.field.unset',
          id: ref.id,
          field: 'groupId'
        })
      })
    })

    return {
      nodeIds,
      edgeIds
    }
  }
}
