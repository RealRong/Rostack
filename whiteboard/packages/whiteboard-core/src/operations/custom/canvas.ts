import {
  type MutationOrderedEffect
} from '@shared/mutation'
import {
  readStructuralEffectResult
} from '@shared/mutation/engine'
import {
  CANVAS_ORDER_STRUCTURE,
  canvasRefKey,
  whiteboardStructures,
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
  const effect: MutationOrderedEffect = existingRefs.length === 1
    ? {
        type: 'ordered.move',
        structure: CANVAS_ORDER_STRUCTURE,
        itemId: canvasRefKey(existingRefs[0]!),
        to: anchor
      }
    : {
        type: 'ordered.splice',
        structure: CANVAS_ORDER_STRUCTURE,
        itemIds: existingRefs.map((ref) => canvasRefKey(ref)),
        to: anchor
      }
  const result = readStructuralEffectResult({
    document: input.document,
    effect,
    structures: whiteboardStructures
  })
  if (!result.ok) {
    return input.fail({
      code: 'invalid',
      message: result.error.message
    })
  }
  if (result.data.historyMode === 'neutral') {
    return
  }

  if (effect.type === 'ordered.move') {
    input.effects.structure.ordered.move(
      effect.structure,
      effect.itemId,
      effect.to
    )
    return
  }

  input.effects.structure.ordered.splice(
    effect.structure,
    effect.itemIds,
    effect.to
  )
}
