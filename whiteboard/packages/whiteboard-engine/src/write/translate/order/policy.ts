import type { OrderMode } from '@engine-types/command'
import {
  listCanvasItemRefs
} from '@whiteboard/core/document'
import type {
  CanvasItemRef,
  Document
} from '@whiteboard/core/types'
import {
  fromKey,
  groupOf,
  key,
  sameOrder,
  same
} from './refs'

type Doc = Pick<Document, 'nodes' | 'edges'>
type OrderedDoc = Pick<Document, 'nodes' | 'edges' | 'order'>

type CanvasOrderRole = 'frame' | 'content-node' | 'edge'

const roleOf = (
  doc: Doc,
  ref: CanvasItemRef
): CanvasOrderRole => {
  if (ref.kind === 'edge') {
    return 'edge'
  }

  return doc.nodes[ref.id]?.type === 'frame'
    ? 'frame'
    : 'content-node'
}

const withFrameBarrier = (
  doc: Doc,
  refs: readonly CanvasItemRef[]
): CanvasItemRef[] => {
  const nodeIndexes: number[] = []
  const frames: CanvasItemRef[] = []
  const contentNodes: CanvasItemRef[] = []

  refs.forEach((ref, index) => {
    const role = roleOf(doc, ref)
    if (role === 'edge') {
      return
    }

    nodeIndexes.push(index)
    if (role === 'frame') {
      frames.push(ref)
      return
    }

    contentNodes.push(ref)
  })

  if (!frames.length || !contentNodes.length) {
    return Array.from(refs)
  }

  const next = Array.from(refs)
  const orderedNodes = [...frames, ...contentNodes]

  nodeIndexes.forEach((index, slot) => {
    next[index] = orderedNodes[slot] ?? next[index]!
  })

  return next
}

const toFront = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const kept = order.filter((id) => !set.has(id))
  const moved = order.filter((id) => set.has(id))
  return [...kept, ...moved]
}

const toBack = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const kept = order.filter((id) => !set.has(id))
  const moved = order.filter((id) => set.has(id))
  return [...moved, ...kept]
}

const forward = <T extends string>(order: T[], ids: T[]) => {
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

const backward = <T extends string>(order: T[], ids: T[]) => {
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

const applyMode = (
  doc: Doc,
  currentRefs: readonly CanvasItemRef[],
  targetRefs: readonly CanvasItemRef[],
  mode: OrderMode
): CanvasItemRef[] => {
  if (mode === 'set') {
    return withFrameBarrier(doc, targetRefs)
  }

  const current = currentRefs.map(key)
  const target = targetRefs.map(key)
  let next: string[]

  switch (mode) {
    case 'front':
      next = toFront(current, target)
      break
    case 'back':
      next = toBack(current, target)
      break
    case 'forward':
      next = forward(current, target)
      break
    case 'backward':
      next = backward(current, target)
      break
    default:
      next = target
      break
  }

  return withFrameBarrier(
    doc,
    next.map(fromKey)
  )
}

const replaceGroupSlice = (
  doc: Doc,
  orderRefs: readonly CanvasItemRef[],
  groupId: string,
  nextSlice: readonly CanvasItemRef[]
): CanvasItemRef[] => {
  let sliceIndex = 0

  return orderRefs.map((ref) => {
    if (groupOf(doc, ref) !== groupId) {
      return ref
    }

    const nextRef = nextSlice[sliceIndex]
    sliceIndex += 1
    return nextRef ?? ref
  })
}

export const block = (
  current: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[]
): CanvasItemRef[] | undefined => {
  if (!refs.length) {
    return undefined
  }

  const firstIndex = current.findIndex((entry) => (
    refs.some((ref) => same(entry, ref))
  ))
  if (firstIndex < 0) {
    return undefined
  }

  const kept = current.filter((entry) => (
    !refs.some((ref) => same(entry, ref))
  ))
  const next = [
    ...kept.slice(0, firstIndex),
    ...refs,
    ...kept.slice(firstIndex)
  ]

  return sameOrder(next, current)
    ? undefined
    : next
}

export const normalizeOrder = ({
  doc,
  refs,
  mode
}: {
  doc: OrderedDoc
  refs: readonly CanvasItemRef[]
  mode: OrderMode
}) => {
  const current = listCanvasItemRefs(doc)
  const keySet = new Set(refs.map(key))
  const selected = mode === 'set'
    ? Array.from(new Set(refs.map(key))).map(fromKey)
    : current.filter((ref) => keySet.has(key(ref)))

  if (mode === 'set' || selected.length <= 1) {
    return {
      current,
      next: applyMode(doc, current, selected, mode)
    }
  }

  let nextCurrent = current
  const globalKeySet = new Set<string>()
  const groupedSelection = new Map<string, CanvasItemRef[]>()

  selected.forEach((ref) => {
    const groupId = groupOf(doc, ref)
    if (!groupId) {
      globalKeySet.add(key(ref))
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
    const groupSlice = nextCurrent.filter((ref) => groupOf(doc, ref) === groupId)
    if (!groupSlice.length) {
      return
    }

    const fullGroupSelected = (
      selectedRefs.length === groupSlice.length
      && sameOrder(selectedRefs, groupSlice)
    )
    if (fullGroupSelected) {
      groupSlice.forEach((ref) => {
        globalKeySet.add(key(ref))
      })
      return
    }

    const nextSlice = applyMode(doc, groupSlice, selectedRefs, mode)
    nextCurrent = replaceGroupSlice(doc, nextCurrent, groupId, nextSlice)
  })

  const globalRefs = nextCurrent.filter((ref) => globalKeySet.has(key(ref)))
  return {
    current,
    next: applyMode(doc, nextCurrent, globalRefs, mode)
  }
}
