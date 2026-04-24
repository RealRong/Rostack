import { document as documentApi } from '@whiteboard/core/document'
import { createGroupOrderMoveOps } from '@whiteboard/core/group/ops'
import type { WhiteboardIntentContext } from '@whiteboard/core/intent/context'
import type { GroupIntent } from '@whiteboard/core/intent/types'

export const compileGroupIntent = (
  intent: GroupIntent,
  ctx: WhiteboardIntentContext
) => {
  const document = ctx.tx.read.document.get()

  switch (intent.type) {
    case 'group.merge': {
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
    }
    case 'group.order.move': {
      createGroupOrderMoveOps({
        document,
        ids: intent.ids,
        mode: intent.mode
      }).forEach((op) => ctx.tx.emit(op))
      return
    }
    case 'group.ungroup': {
      const nodeIds: string[] = []
      const edgeIds: string[] = []

      intent.ids.forEach((groupId) => {
        const refs = documentApi.list.groupCanvasRefs(document, groupId)
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
}
