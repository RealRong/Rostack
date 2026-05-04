import { node as nodeApi } from '@whiteboard/core/node'
import { createFrameQuery } from '@whiteboard/core/node/frame'
import {
  createWhiteboardQuery,
  createWhiteboardReader,
} from '@whiteboard/core/query'
import type {
  CanvasItemRef,
  CanvasOrderAnchor,
  Document,
  GroupId
} from '@whiteboard/core/types'
import type { Intent } from '@whiteboard/engine/contracts/intent'

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
): boolean => left.kind === right.kind && left.id === right.id

const sameCanvasRefList = (
  left: readonly CanvasItemRef[],
  right: readonly CanvasItemRef[]
): boolean => (
  left.length === right.length
  && left.every((entry, index) => sameCanvasRef(entry, right[index]!))
)

const createSelectedSet = (
  refs: readonly CanvasItemRef[]
) => new Set(refs.map((ref) => `${ref.kind}\0${ref.id}`))

const isSelectedRef = (
  selected: ReadonlySet<string>,
  ref: CanvasItemRef
) => selected.has(`${ref.kind}\0${ref.id}`)

const readFrameConstraint = (input: {
  document: Document
  refs: readonly CanvasItemRef[]
  order: readonly CanvasItemRef[]
}): {
  minIndex: number
} | undefined => {
  if (input.refs.length === 0 || input.refs.some((ref) => ref.kind !== 'node')) {
    return undefined
  }

  const nodes = Object.values(input.document.nodes).filter((node): node is NonNullable<typeof node> => node !== undefined)
  const frame = createFrameQuery({
    nodes,
    getNodeRect: (node) => nodeApi.geometry.rect(node),
    getFrameRect: (node) => (
      node.type === 'frame'
        ? nodeApi.geometry.rect(node)
        : undefined
    )
  })
  const parentIds = new Set(input.refs.map((ref) => frame.parent(ref.id)))
  if (parentIds.size !== 1) {
    return undefined
  }

  const frameId = [...parentIds][0]
  if (!frameId) {
    return undefined
  }

  const frameIndex = input.order.findIndex((entry) => (
    entry.kind === 'node' && entry.id === frameId
  ))
  if (frameIndex < 0) {
    return undefined
  }

  return {
    minIndex: frameIndex + 1
  }
}

const reorderCanvasRefs = (
  current: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[],
  direction: 'forward' | 'backward',
  constraint?: {
    minIndex: number
  }
): readonly CanvasItemRef[] => {
  const next = [...current]
  const selected = refs.filter((ref) => next.some((entry) => sameCanvasRef(entry, ref)))
  if (selected.length === 0) {
    return next
  }

  const selectedSet = createSelectedSet(selected)
  const isSelected = (entry: CanvasItemRef) => isSelectedRef(selectedSet, entry)

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
    if (
      isSelected(items[index]!)
      && !isSelected(items[index - 1]!)
      && (constraint?.minIndex === undefined || index - 1 >= constraint.minIndex)
    ) {
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
): readonly Extract<Intent, { type: 'document.order.move' }>[] => {
  const working = [...current]
  const ops: Extract<Intent, { type: 'document.order.move' }>[] = []

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
      type: 'document.order.move',
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

const moveCanvasRefs = (input: {
  current: readonly CanvasItemRef[]
  refs: readonly CanvasItemRef[]
  to: CanvasOrderAnchor
  constraint?: {
    minIndex: number
  }
}): readonly CanvasItemRef[] => {
  const selectedSet = createSelectedSet(input.refs)
  const selected = input.current.filter((ref) => isSelectedRef(selectedSet, ref))
  if (selected.length === 0) {
    return input.current
  }

  const filtered = input.current.filter((ref) => !isSelectedRef(selectedSet, ref))
  let targetIndex = 0

  switch (input.to.kind) {
    case 'front':
      targetIndex = filtered.length
      break
    case 'back':
      targetIndex = 0
      break
    case 'before': {
      const anchorRef = input.to.ref
      const anchorIndex = filtered.findIndex((entry) => sameCanvasRef(entry, anchorRef))
      targetIndex = anchorIndex < 0
        ? 0
        : anchorIndex
      break
    }
    case 'after': {
      const anchorRef = input.to.ref
      const anchorIndex = filtered.findIndex((entry) => sameCanvasRef(entry, anchorRef))
      targetIndex = anchorIndex < 0
        ? filtered.length
        : anchorIndex + 1
      break
    }
  }

  if (input.constraint) {
    const minIndex = Math.min(input.constraint.minIndex, filtered.length)
    targetIndex = Math.max(targetIndex, minIndex)
  }

  return [
    ...filtered.slice(0, targetIndex),
    ...selected,
    ...filtered.slice(targetIndex)
  ]
}

export const planCanvasOrderMove = (input: {
  document: Document
  refs: readonly CanvasItemRef[]
  to: CanvasOrderAnchor
}): readonly Extract<Intent, { type: 'document.order.move' }>[] => {
  const reader = createWhiteboardReader(() => input.document)
  const current = reader.order.items()
  const constraint = readFrameConstraint({
    document: input.document,
    refs: input.refs,
    order: current
  })
  const target = moveCanvasRefs({
    current,
    refs: input.refs,
    to: input.to,
    constraint
  })

  return sameCanvasRefList(current, target)
    ? []
    : createCanvasOrderMoveIntents(current, target)
}

export const planCanvasOrderStep = (input: {
  document: Document
  refs: readonly CanvasItemRef[]
  direction: 'forward' | 'backward'
}): readonly Extract<Intent, { type: 'document.order.move' }>[] => {
  const reader = createWhiteboardReader(() => input.document)
  const current = reader.order.items()
  const constraint = readFrameConstraint({
    document: input.document,
    refs: input.refs,
    order: current
  })
  const target = reorderCanvasRefs(current, input.refs, input.direction, constraint)
  return sameCanvasRefList(current, target)
    ? []
    : createCanvasOrderMoveIntents(current, target)
}

export const planGroupOrderMove = (input: {
  document: Document
  ids: readonly GroupId[]
  to: CanvasOrderAnchor
}): readonly Extract<Intent, { type: 'document.order.move' }>[] => {
  const query = createWhiteboardQuery(() => input.document)
  const refs = input.ids.flatMap((groupId) => query.group.refsInOrder(groupId))
  return planCanvasOrderMove({
    document: input.document,
    refs,
    to: input.to
  })
}

export const planGroupOrderStep = (input: {
  document: Document
  ids: readonly GroupId[]
  direction: 'forward' | 'backward'
}): readonly Extract<Intent, { type: 'document.order.move' }>[] => {
  const query = createWhiteboardQuery(() => input.document)
  const refs = input.ids.flatMap((groupId) => query.group.refsInOrder(groupId))
  return planCanvasOrderStep({
    document: input.document,
    refs,
    direction: input.direction
  })
}
