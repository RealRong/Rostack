import type {
  Operation
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

type GroupOperation = Extract<
  Operation,
  { type: 'group.create' | 'group.restore' | 'group.field.set' | 'group.field.unset' | 'group.delete' }
>

export const handleGroupOperation = (
  tx: ReducerTx,
  operation: GroupOperation
) => {
  switch (operation.type) {
    case 'group.create':
      tx.group.lifecycle.create(operation.group)
      return
    case 'group.restore':
      tx.group.lifecycle.restore(operation.group)
      return
    case 'group.field.set':
      tx.group.field.set(operation.id, operation.field, operation.value as never)
      return
    case 'group.field.unset':
      tx.group.field.unset(operation.id, operation.field)
      return
    case 'group.delete':
      tx.group.lifecycle.delete(operation.id)
  }
}
