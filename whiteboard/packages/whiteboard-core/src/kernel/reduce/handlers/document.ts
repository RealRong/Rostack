import type {
  Operation
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

type DocumentOperation = Extract<
  Operation,
  { type: 'document.replace' | 'document.background' | 'canvas.order.move' }
>

export const handleDocumentOperation = (
  tx: ReducerTx,
  operation: DocumentOperation
) => {
  switch (operation.type) {
    case 'document.replace':
      tx.document.lifecycle.replace(operation.document)
      return
    case 'document.background':
      tx.document.background.set(operation.background)
      return
    case 'canvas.order.move':
      tx.collection.canvas.order().structure.moveMany(operation.refs, operation.to)
  }
}
