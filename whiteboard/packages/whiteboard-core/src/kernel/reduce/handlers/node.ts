import type {
  Operation
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

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

export const handleNodeOperation = (
  tx: ReducerTx,
  operation: NodeOperation
) => {
  switch (operation.type) {
    case 'node.create':
      tx.node.lifecycle.create(operation.node)
      return
    case 'node.restore':
      tx.node.lifecycle.restore(operation.node, operation.slot)
      return
    case 'node.field.set':
      tx.node.field.set(operation.id, operation.field, operation.value as never)
      return
    case 'node.field.unset':
      tx.node.field.unset(operation.id, operation.field)
      return
    case 'node.record.set':
      tx.node.record.set(operation.id, operation.scope, operation.path, operation.value)
      return
    case 'node.record.unset':
      tx.node.record.unset(operation.id, operation.scope, operation.path)
      return
    case 'node.delete':
      tx.node.lifecycle.delete(operation.id)
  }
}
