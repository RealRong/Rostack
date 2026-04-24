import type { Operation } from '@whiteboard/core/types'
import type { WhiteboardReduceCtx } from '@whiteboard/core/reducer/types'

type GroupOperation = Extract<
  Operation,
  {
    type:
      | 'group.create'
      | 'group.restore'
      | 'group.field.set'
      | 'group.field.unset'
      | 'group.delete'
  }
>

export const reduceGroupOperation = (
  ctx: WhiteboardReduceCtx,
  operation: GroupOperation
) => {
  switch (operation.type) {
    case 'group.create':
      ctx.group.create(operation.group)
      return
    case 'group.restore':
      ctx.group.restore(operation.group)
      return
    case 'group.field.set':
      ctx.group.setField(operation.id, operation.field, operation.value as never)
      return
    case 'group.field.unset':
      ctx.group.unsetField(operation.id, operation.field)
      return
    case 'group.delete':
      ctx.group.delete(operation.id)
  }
}
