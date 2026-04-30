import {
  createStructuralOrderedMoveOperation,
  createStructuralOrderedSpliceOperation,
  type MutationStructuralOrderedMoveOperation,
  type MutationStructuralOrderedSpliceOperation,
} from '@shared/mutation'
import {
  CANVAS_ORDER_STRUCTURE,
  canvasRefKey,
  readStructuralDocument,
  toStructuralCanvasAnchor,
} from './structures'
import {
  emitStructuralOperation
} from './effects'
import type {
  WhiteboardCustomPlanContext
} from './types'

export const planCanvasOrderMove = (
  input: WhiteboardCustomPlanContext<
    Extract<import('@whiteboard/core/types').Operation, { type: 'canvas.order.move' }>
  >
): void => {
  const currentOrder = input.reader.canvas.order()
  const existingRefs = input.op.refs.filter((ref) => (
    currentOrder.some((entry) => canvasRefKey(entry) === canvasRefKey(ref))
  ))
  if (existingRefs.length === 0) {
    return
  }

  const anchor = toStructuralCanvasAnchor(currentOrder, existingRefs, input.op.to)
  const operation = existingRefs.length === 1
    ? createStructuralOrderedMoveOperation<MutationStructuralOrderedMoveOperation>({
        structure: CANVAS_ORDER_STRUCTURE,
        itemId: canvasRefKey(existingRefs[0]!),
        to: anchor
      })
    : createStructuralOrderedSpliceOperation<MutationStructuralOrderedSpliceOperation>({
        structure: CANVAS_ORDER_STRUCTURE,
        itemIds: existingRefs.map((ref) => canvasRefKey(ref)),
        to: anchor
      })
  const result = readStructuralDocument({
    document: input.document,
    operation,
    fail: input.fail
  })
  if (result.historyMode === 'neutral') {
    return
  }

  emitStructuralOperation(input, operation)
}
