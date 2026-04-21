import { equal } from '@shared/core'


export const createOrderIndex = <T extends string>(
  ids: readonly T[]
): ReadonlyMap<T, number> => {
  const order = new Map<T, number>()

  ids.forEach((id, index) => {
    order.set(id, index)
  })

  return order
}

const compareOrderedIds = <T extends string>(
  order: ReadonlyMap<T, number>,
  left: T,
  right: T
) => (
  (order.get(left) ?? Number.MAX_SAFE_INTEGER)
  - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
)

const findOrderedInsertIndex = <T extends string>(
  ids: readonly T[],
  id: T,
  order: ReadonlyMap<T, number>
): number => {
  const nextOrder = order.get(id) ?? Number.MAX_SAFE_INTEGER
  let low = 0
  let high = ids.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const middleOrder = order.get(ids[middle]!) ?? Number.MAX_SAFE_INTEGER
    if (middleOrder < nextOrder) {
      low = middle + 1
      continue
    }

    high = middle
  }

  return low
}

const findOrderedIdIndex = <T extends string>(
  ids: readonly T[],
  id: T,
  order: ReadonlyMap<T, number>
): number => {
  const start = findOrderedInsertIndex(ids, id, order)
  if (start >= ids.length) {
    return -1
  }

  const targetOrder = order.get(id) ?? Number.MAX_SAFE_INTEGER
  for (let index = start; index < ids.length; index += 1) {
    const current = ids[index]!
    const currentOrder = order.get(current) ?? Number.MAX_SAFE_INTEGER
    if (currentOrder !== targetOrder) {
      return -1
    }
    if (current === id) {
      return index
    }
  }

  return -1
}

export const removeOrderedIdInPlace = <T extends string>(
  ids: T[],
  id: T,
  order: ReadonlyMap<T, number>
): boolean => {
  const index = findOrderedIdIndex(ids, id, order)
  if (index < 0) {
    return false
  }

  ids.splice(index, 1)
  return true
}

export const insertOrderedIdInPlace = <T extends string>(
  ids: T[],
  id: T,
  order: ReadonlyMap<T, number>
): boolean => {
  const index = findOrderedInsertIndex(ids, id, order)
  if (ids[index] === id) {
    return false
  }

  if (index >= ids.length) {
    ids.push(id)
    return true
  }

  ids.splice(index, 0, id)
  return true
}

export const sortIdsByOrder = <T extends string>(
  ids: readonly T[],
  order: ReadonlyMap<T, number>
): readonly T[] => ids.length <= 1
  ? ids
  : [...ids].sort((left, right) => compareOrderedIds(order, left, right))

export const applyOrderedIdDelta = <T extends string>(input: {
  previous: readonly T[]
  remove?: ReadonlySet<T>
  add?: readonly T[]
  order: ReadonlyMap<T, number>
}): readonly T[] => {
  if (!input.remove?.size && !input.add?.length) {
    return input.previous
  }

  const added = input.add?.length
    ? sortIdsByOrder(input.add, input.order)
    : undefined

  const filtered = !input.remove?.size
    ? input.previous
    : input.previous.filter(id => !input.remove?.has(id))

  if (!added?.length) {
    return equal.sameOrder(filtered, input.previous)
      ? input.previous
      : filtered
  }

  if (!filtered.length) {
    return added
  }

  const merged: T[] = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < filtered.length && rightIndex < added.length) {
    const left = filtered[leftIndex]!
    const right = added[rightIndex]!
    const compare = compareOrderedIds(input.order, left, right)
    if (compare <= 0) {
      merged.push(left)
      leftIndex += 1
      if (compare === 0 && left === right) {
        rightIndex += 1
      }
      continue
    }

    merged.push(right)
    rightIndex += 1
  }

  while (leftIndex < filtered.length) {
    merged.push(filtered[leftIndex]!)
    leftIndex += 1
  }
  while (rightIndex < added.length) {
    merged.push(added[rightIndex]!)
    rightIndex += 1
  }

  return equal.sameOrder(merged, input.previous)
    ? input.previous
    : merged
}
