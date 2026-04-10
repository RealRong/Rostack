import type { OrderMode } from '@engine-types/command'
import type {
  CanvasItemRef,
  Document
} from '@whiteboard/core/types'
import { listCanvasItemRefs } from '@whiteboard/core/document'

const readRefGroupId = (
  doc: Pick<Document, 'nodes' | 'edges'>,
  ref: CanvasItemRef
) => (
  ref.kind === 'node'
    ? doc.nodes[ref.id]?.groupId
    : doc.edges[ref.id]?.groupId
)

export const isSameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

const serializeRef = (ref: CanvasItemRef) => `${ref.kind}:${ref.id}`

const parseRef = (key: string): CanvasItemRef => {
  const [kind, id] = key.split(':')
  return kind === 'edge'
    ? { kind: 'edge', id }
    : { kind: 'node', id }
}

const bringOrderToFront = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const kept = order.filter((id) => !set.has(id))
  const moved = order.filter((id) => set.has(id))
  return [...kept, ...moved]
}

const sendOrderToBack = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const kept = order.filter((id) => !set.has(id))
  const moved = order.filter((id) => set.has(id))
  return [...moved, ...kept]
}

const bringOrderForward = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const next = [...order]
  for (let index = next.length - 2; index >= 0; index -= 1) {
    const current = next[index]
    const after = next[index + 1]
    if (set.has(current) && !set.has(after)) {
      next[index] = after
      next[index + 1] = current
    }
  }
  return next
}

const sendOrderBackward = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const next = [...order]
  for (let index = 1; index < next.length; index += 1) {
    const current = next[index]
    const before = next[index - 1]
    if (set.has(current) && !set.has(before)) {
      next[index - 1] = current
      next[index] = before
    }
  }
  return next
}

const reorderRefs = (
  currentRefs: readonly CanvasItemRef[],
  targetRefs: readonly CanvasItemRef[],
  mode: OrderMode
): CanvasItemRef[] => {
  if (mode === 'set') {
    return Array.from(targetRefs)
  }

  const current = currentRefs.map(serializeRef)
  const target = targetRefs.map(serializeRef)
  let nextOrder: string[]

  switch (mode) {
    case 'front':
      nextOrder = bringOrderToFront(current, target)
      break
    case 'back':
      nextOrder = sendOrderToBack(current, target)
      break
    case 'forward':
      nextOrder = bringOrderForward(current, target)
      break
    case 'backward':
      nextOrder = sendOrderBackward(current, target)
      break
    default:
      nextOrder = target
      break
  }

  return nextOrder.map(parseRef)
}

const replaceGroupSlice = (
  doc: Pick<Document, 'nodes' | 'edges'>,
  orderRefs: readonly CanvasItemRef[],
  groupId: string,
  nextSlice: readonly CanvasItemRef[]
): CanvasItemRef[] => {
  let sliceIndex = 0
  return orderRefs.map((ref) => {
    if (readRefGroupId(doc, ref) !== groupId) {
      return ref
    }

    const nextRef = nextSlice[sliceIndex]
    sliceIndex += 1
    return nextRef ?? ref
  })
}

export const normalizeCanvasOrderTargets = ({
  doc,
  refs,
  mode
}: {
  doc: Pick<Document, 'nodes' | 'edges' | 'order'>
  refs: readonly CanvasItemRef[]
  mode: OrderMode
}) => {
  const current = listCanvasItemRefs(doc)
  const keySet = new Set(refs.map(serializeRef))
  const selected = mode === 'set'
    ? Array.from(new Set(refs.map(serializeRef))).map(parseRef)
    : current.filter((ref) => keySet.has(serializeRef(ref)))

  if (mode === 'set' || selected.length <= 1) {
    return {
      current,
      next: reorderRefs(current, selected, mode)
    }
  }

  let nextCurrent = current
  const globalKeySet = new Set<string>()
  const groupedSelection = new Map<string, CanvasItemRef[]>()

  selected.forEach((ref) => {
    const groupId = readRefGroupId(doc, ref)
    if (!groupId) {
      globalKeySet.add(serializeRef(ref))
      return
    }

    const items = groupedSelection.get(groupId)
    if (items) {
      items.push(ref)
      return
    }

    groupedSelection.set(groupId, [ref])
  })

  groupedSelection.forEach((selectedRefs, groupId) => {
    const groupSlice = nextCurrent.filter((ref) => readRefGroupId(doc, ref) === groupId)
    if (!groupSlice.length) {
      return
    }

    const fullGroupSelected = (
      selectedRefs.length === groupSlice.length
      && selectedRefs.every((ref, index) => isSameCanvasRef(ref, groupSlice[index]!))
    )
    if (fullGroupSelected) {
      groupSlice.forEach((ref) => {
        globalKeySet.add(serializeRef(ref))
      })
      return
    }

    const nextSlice = reorderRefs(groupSlice, selectedRefs, mode)
    nextCurrent = replaceGroupSlice(doc, nextCurrent, groupId, nextSlice)
  })

  const globalRefs = nextCurrent.filter((ref) => globalKeySet.has(serializeRef(ref)))
  return {
    current,
    next: reorderRefs(nextCurrent, globalRefs, mode)
  }
}
