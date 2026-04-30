import { createDocumentReader } from '@whiteboard/core/document/reader'
import type {
  CanvasItemRef,
  Document,
  GroupId
} from '@whiteboard/core/types'
import type { Intent } from '@whiteboard/engine/contracts/intent'

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
): boolean => left.kind === right.kind && left.id === right.id

const reorderCanvasRefs = (
  current: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[],
  direction: 'forward' | 'backward'
): readonly CanvasItemRef[] => {
  const next = [...current]
  const selected = refs.filter((ref) => next.some((entry) => sameCanvasRef(entry, ref)))
  if (selected.length === 0) {
    return next
  }

  const isSelected = (entry: CanvasItemRef) =>
    selected.some((ref) => sameCanvasRef(ref, entry))

  const items = [...next]
  if (direction === 'forward') {
    for (let index = items.length - 2; index >= 0; index -= 1) {
      if (isSelected(items[index]!) && !isSelected(items[index + 1]!)) {
        const currentEntry = items[index]!
        items[index] = items[index + 1]!
        items[index + 1] = currentEntry
      }
    }
    return items
  }

  for (let index = 1; index < items.length; index += 1) {
    if (isSelected(items[index]!) && !isSelected(items[index - 1]!)) {
      const currentEntry = items[index]!
      items[index] = items[index - 1]!
      items[index - 1] = currentEntry
    }
  }
  return items
}

const createCanvasOrderMoveIntents = (
  current: readonly CanvasItemRef[],
  target: readonly CanvasItemRef[]
): readonly Extract<Intent, { type: 'canvas.order.move' }>[] => {
  const working = [...current]
  const ops: Extract<Intent, { type: 'canvas.order.move' }>[] = []

  for (let index = 0; index < target.length; index += 1) {
    const ref = target[index]!
    if (sameCanvasRef(working[index] ?? { kind: ref.kind, id: '' }, ref)) {
      continue
    }

    const currentIndex = working.findIndex((entry) => sameCanvasRef(entry, ref))
    if (currentIndex < 0) {
      continue
    }

    working.splice(currentIndex, 1)
    working.splice(index, 0, ref)
    ops.push({
      type: 'canvas.order.move',
      refs: [ref],
      to: index === 0
        ? { kind: 'front' }
        : {
            kind: 'after',
            ref: target[index - 1]!
          }
    })
  }

  return ops
}

export const planCanvasOrderStep = (input: {
  document: Document
  refs: readonly CanvasItemRef[]
  direction: 'forward' | 'backward'
}): readonly Extract<Intent, { type: 'canvas.order.move' }>[] => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.canvas.order()
  const target = reorderCanvasRefs(current, input.refs, input.direction)
  return createCanvasOrderMoveIntents(current, target)
}

export const planGroupOrderStep = (input: {
  document: Document
  ids: readonly GroupId[]
  direction: 'forward' | 'backward'
}): readonly Extract<Intent, { type: 'canvas.order.move' }>[] => {
  const reader = createDocumentReader(() => input.document)
  const refs = input.ids.flatMap((groupId) => reader.canvas.groupRefs(groupId))
  return planCanvasOrderStep({
    document: input.document,
    refs,
    direction: input.direction
  })
}
