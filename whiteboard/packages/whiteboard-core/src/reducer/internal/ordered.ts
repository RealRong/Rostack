export type OrderedAnchor = {
  kind: 'start'
} | {
  kind: 'end'
} | {
  kind: 'before'
  itemId: string
} | {
  kind: 'after'
  itemId: string
}

export const removeOrderedItem = <T,>(
  items: readonly T[],
  itemId: string,
  getId: (item: T) => string
): readonly T[] => {
  const index = items.findIndex((item) => getId(item) === itemId)
  if (index < 0) {
    return [...items]
  }

  return [
    ...items.slice(0, index),
    ...items.slice(index + 1)
  ]
}

export const insertOrderedItem = <T,>(
  items: readonly T[],
  item: T,
  anchor: OrderedAnchor,
  getId: (entry: T) => string
): readonly T[] => {
  const itemId = getId(item)
  const filtered = removeOrderedItem(items, itemId, getId)

  if (anchor.kind === 'start') {
    return [item, ...filtered]
  }
  if (anchor.kind === 'end') {
    return [...filtered, item]
  }

  const anchorIndex = filtered.findIndex((entry) => getId(entry) === anchor.itemId)
  if (anchorIndex < 0) {
    return anchor.kind === 'before'
      ? [item, ...filtered]
      : [...filtered, item]
  }

  return anchor.kind === 'before'
    ? [...filtered.slice(0, anchorIndex), item, ...filtered.slice(anchorIndex)]
    : [...filtered.slice(0, anchorIndex + 1), item, ...filtered.slice(anchorIndex + 1)]
}

export const moveOrderedItem = <T,>(
  items: readonly T[],
  itemId: string,
  anchor: OrderedAnchor,
  getId: (item: T) => string
): readonly T[] => {
  const item = items.find((entry) => getId(entry) === itemId)
  if (!item) {
    return [...items]
  }

  return insertOrderedItem(items, item, anchor, getId)
}

export const readOrderedSlot = <T,>(
  items: readonly T[],
  itemId: string,
  getId: (item: T) => string
): {
  prev?: T
  next?: T
} | undefined => {
  const index = items.findIndex((entry) => getId(entry) === itemId)
  if (index < 0) {
    return undefined
  }

  return {
    prev: items[index - 1],
    next: items[index + 1]
  }
}

export const insertOrderedSlot = <T,>(
  items: readonly T[],
  item: T,
  slot: {
    prev?: T
    next?: T
  } | undefined,
  getId: (entry: T) => string
): readonly T[] => {
  const itemId = getId(item)
  const filtered = removeOrderedItem(items, itemId, getId)

  if (!slot) {
    return [...filtered, item]
  }
  if (slot.prev) {
    return insertOrderedItem(filtered, item, {
      kind: 'after',
      itemId: getId(slot.prev)
    }, getId)
  }
  if (slot.next) {
    return insertOrderedItem(filtered, item, {
      kind: 'before',
      itemId: getId(slot.next)
    }, getId)
  }

  return [...filtered, item]
}
