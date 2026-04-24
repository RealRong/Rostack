import type { Operation } from '@whiteboard/core/types'
import type { WhiteboardReduceCtx } from '@whiteboard/core/reducer/types'

type NodeOperation = Extract<
  Operation,
  {
    type:
      | 'node.create'
      | 'node.restore'
      | 'node.field.set'
      | 'node.field.unset'
      | 'node.record.set'
      | 'node.record.unset'
      | 'node.delete'
  }
>

export const reduceNodeOperation = (
  ctx: WhiteboardReduceCtx,
  operation: NodeOperation
) => {
  switch (operation.type) {
    case 'node.create':
      ctx.node.create(operation.node)
      return
    case 'node.restore':
      ctx.node.restore(operation.node, operation.slot)
      return
    case 'node.field.set':
      ctx.node.setField(operation.id, operation.field, operation.value as never)
      return
    case 'node.field.unset':
      ctx.node.unsetField(operation.id, operation.field)
      return
    case 'node.record.set':
      ctx.node.setRecord(operation.id, operation.scope, operation.path, operation.value)
      return
    case 'node.record.unset':
      ctx.node.unsetRecord(operation.id, operation.scope, operation.path)
      return
    case 'node.delete':
      ctx.node.delete(operation.id)
  }
}
