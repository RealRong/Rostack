import {
  CANVAS_ORDER_STRUCTURE,
  canvasRefKey,
  toStructuralCanvasAnchor,
} from './structures'
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
  if (existingRefs.length === 1) {
    input.program.structure.ordered.move(
      CANVAS_ORDER_STRUCTURE,
      canvasRefKey(existingRefs[0]!),
      anchor
    )
    return
  }

  input.program.structure.ordered.splice(
    CANVAS_ORDER_STRUCTURE,
    existingRefs.map((ref) => canvasRefKey(ref)),
    anchor
  )
}
