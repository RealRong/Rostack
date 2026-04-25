import type {
  CanvasItemRef,
  CanvasSlot
} from '@whiteboard/core/types'
import type { WhiteboardReduceState } from './state'
import {
  cloneCanvasRef,
  cloneCanvasSlot,
  markCanvasOrderTouched
} from './state'
import {
  insertOrderedSlot,
  readOrderedSlot
} from './ordered'

export const canvasRefKey = (
  ref: CanvasItemRef
): string => `${ref.kind}:${ref.id}`

export const appendCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): readonly CanvasItemRef[] => (
  order.some((entry) => canvasRefKey(entry) === canvasRefKey(ref))
    ? order
    : [...order, cloneCanvasRef(ref)!]
)

export const removeCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): readonly CanvasItemRef[] => {
  const index = order.findIndex((entry) => canvasRefKey(entry) === canvasRefKey(ref))
  if (index < 0) {
    return order
  }

  return [
    ...order.slice(0, index),
    ...order.slice(index + 1)
  ]
}

export const readCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): CanvasSlot | undefined => cloneCanvasSlot(
  readOrderedSlot(order, canvasRefKey(ref), canvasRefKey)
)

export const insertCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef,
  slot?: CanvasSlot
): readonly CanvasItemRef[] => insertOrderedSlot(
  order,
  cloneCanvasRef(ref)!,
  slot
    ? {
        prev: cloneCanvasRef(slot.prev),
        next: cloneCanvasRef(slot.next)
      }
    : undefined,
  canvasRefKey
)

export const captureCanvasSlot = (
  state: WhiteboardReduceState,
  ref: CanvasItemRef
): CanvasSlot | undefined => readCanvasSlot(
  state.draft.canvasOrder.current(),
  ref
)

export const moveCanvasItems = (
  state: WhiteboardReduceState,
  refs: readonly CanvasItemRef[],
  to: Extract<import('@whiteboard/core/types').Operation, { type: 'canvas.order.move' }>['to']
): void => {
  const currentOrder = [...state.draft.canvasOrder.current()]
  const existingRefs = refs.filter((ref) => currentOrder.some((entry) => canvasRefKey(entry) === canvasRefKey(ref)))
  if (existingRefs.length === 0) {
    return
  }

  const previousIndex = currentOrder.findIndex((entry) => canvasRefKey(entry) === canvasRefKey(existingRefs[0]!))
  const previousTo: Extract<import('@whiteboard/core/types').Operation, { type: 'canvas.order.move' }>['to'] = previousIndex <= 0
    ? { kind: 'front' }
    : {
        kind: 'after',
        ref: cloneCanvasRef(currentOrder[previousIndex - 1]!)!
      }

  const existingKeys = new Set(existingRefs.map((ref) => canvasRefKey(ref)))
  const filtered = currentOrder.filter((entry) => !existingKeys.has(canvasRefKey(entry)))
  const insertAt = to.kind === 'front'
    ? 0
    : to.kind === 'back'
      ? filtered.length
      : (() => {
          const anchorKey = to.ref
            ? canvasRefKey(to.ref)
            : undefined
          const anchorIndex = filtered.findIndex((entry) => anchorKey !== undefined && canvasRefKey(entry) === anchorKey)
          if (anchorIndex < 0) {
            return to.kind === 'before'
              ? 0
              : filtered.length
          }
          return to.kind === 'before'
            ? anchorIndex
            : anchorIndex + 1
        })()

  filtered.splice(insertAt, 0, ...existingRefs.map((ref) => cloneCanvasRef(ref)!))
  state.inverse.prepend({
    type: 'canvas.order.move',
    refs: existingRefs.map((ref) => cloneCanvasRef(ref)!),
    to: previousTo
  })
  state.draft.canvasOrder.set(filtered)
  markCanvasOrderTouched(state)
}
