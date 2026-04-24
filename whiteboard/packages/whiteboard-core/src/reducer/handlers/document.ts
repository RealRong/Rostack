import type { Operation } from '@whiteboard/core/types'
import type { WhiteboardReduceCtx } from '@whiteboard/core/reducer/types'

type DocumentOperation = Extract<
  Operation,
  { type: 'document.replace' | 'document.background' | 'canvas.order.move' }
>

export const reduceDocumentOperation = (
  ctx: WhiteboardReduceCtx,
  operation: DocumentOperation
) => {
  switch (operation.type) {
    case 'document.replace':
      ctx.document.replace(operation.document)
      return
    case 'document.background':
      ctx.document.setBackground(operation.background)
      return
    case 'canvas.order.move':
      ctx.canvas.move(operation.refs, operation.to)
  }
}
