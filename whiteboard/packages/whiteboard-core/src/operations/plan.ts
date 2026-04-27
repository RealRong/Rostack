import type {
  CanvasItemRef,
  Document,
  GroupId,
  Operation,
  OrderMode
} from '@whiteboard/core/types'

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
): boolean => left.kind === right.kind && left.id === right.id

const reorderCanvasRefs = (
  current: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[],
  mode: OrderMode
): readonly CanvasItemRef[] => {
  const next = [...current]
  const selected = refs.filter((ref) => next.some((entry) => sameCanvasRef(entry, ref)))
  if (selected.length === 0) {
    return next
  }

  const isSelected = (entry: CanvasItemRef) =>
    selected.some((ref) => sameCanvasRef(ref, entry))

  if (mode === 'set') {
    return [...refs]
  }

  const rest = next.filter((entry) => !isSelected(entry))
  if (mode === 'front') {
    return [...rest, ...selected]
  }
  if (mode === 'back') {
    return [...selected, ...rest]
  }

  const items = [...next]
  if (mode === 'forward') {
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

const createCanvasOrderMoveOps = (
  current: readonly CanvasItemRef[],
  target: readonly CanvasItemRef[]
): readonly Operation[] => {
  const working = [...current]
  const ops: Operation[] = []

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

const readCanvasItemGroupId = (
  document: Pick<Document, 'nodes' | 'edges'>,
  ref: CanvasItemRef
): GroupId | undefined => (
  ref.kind === 'node'
    ? document.nodes[ref.id]?.groupId
    : ref.kind === 'edge'
      ? document.edges[ref.id]?.groupId
      : undefined
)

const listGroupCanvasRefs = (
  document: Pick<Document, 'nodes' | 'edges' | 'canvas'>,
  groupId: GroupId
): CanvasItemRef[] => document.canvas.order
  .filter((ref) => readCanvasItemGroupId(document, ref) === groupId)

export const canvasOrderMove = {
  reorder: reorderCanvasRefs,
  ops: createCanvasOrderMoveOps
} as const

export const groupOrderMove = (input: {
  document: Pick<Document, 'canvas' | 'nodes' | 'edges'>
  ids: readonly GroupId[]
  mode: OrderMode
}): readonly Operation[] => {
  const refs = input.ids.flatMap((groupId) =>
    listGroupCanvasRefs(input.document, groupId)
  )
  const current = input.document.canvas.order
  const target = reorderCanvasRefs(current, refs, input.mode)
  return createCanvasOrderMoveOps(current, target)
}
