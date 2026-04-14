export const unique = <T,>(
  values: readonly T[]
): T[] => Array.from(new Set(values))

const EMPTY_VALUES = [] as const

export interface OrderedAccess<TId> {
  has: (id: TId) => boolean
  indexOf: (id: TId) => number | undefined
  at: (index: number) => TId | undefined
  prev: (id: TId) => TId | undefined
  next: (id: TId) => TId | undefined
  range: (anchor: TId, focus: TId) => readonly TId[]
}

export interface OrderedKeyedAccess<TId, TValue> extends OrderedAccess<TId> {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
}

export interface OrderedKeyedCollection<TId, TValue> extends OrderedKeyedAccess<TId, TValue> {
  all: readonly TValue[]
}

export const createOrderedAccess = <TId,>(
  ids: readonly TId[]
): OrderedAccess<TId> => {
  let indexById: ReadonlyMap<TId, number> | undefined
  const ensureIndexById = () => {
    if (indexById) {
      return indexById
    }

    indexById = new Map(
      ids.map((id, index) => [id, index] as const)
    )
    return indexById
  }

  return {
    has: id => ensureIndexById().has(id),
    indexOf: id => ensureIndexById().get(id),
    at: index => ids[index],
    prev: id => {
      const index = ensureIndexById().get(id)
      return index === undefined || index <= 0
        ? undefined
        : ids[index - 1]
    },
    next: id => {
      const index = ensureIndexById().get(id)
      return index === undefined || index >= ids.length - 1
        ? undefined
        : ids[index + 1]
    },
    range: (anchor, focus) => {
      const index = ensureIndexById()
      const anchorIndex = index.get(anchor)
      const focusIndex = index.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return EMPTY_VALUES as readonly TId[]
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    }
  }
}

export const createOrderedKeyedAccess = <TId, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
}): OrderedKeyedAccess<TId, TValue> => ({
  ids: input.ids,
  get: input.get,
  ...createOrderedAccess(input.ids)
})

export const createOrderedKeyedCollection = <TId, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
  all?: readonly TValue[]
}): OrderedKeyedCollection<TId, TValue> => ({
  ...createOrderedKeyedAccess(input),
  all: input.all ?? presentValues(input.ids, input.get)
})

export const uniqueBy = <T, K>(
  values: readonly T[],
  keyOf: (value: T) => K
): T[] => {
  const seen = new Set<K>()
  const next: T[] = []

  values.forEach(value => {
    const key = keyOf(value)
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    next.push(value)
  })

  return next
}

export const uniqueSorted = <T,>(
  values: readonly T[],
  compare?: (left: T, right: T) => number
): T[] => {
  const next = unique(values)
  return compare
    ? next.sort(compare)
    : next.sort()
}

export const presentValues = <TId, TValue>(
  ids: readonly TId[],
  read: (id: TId) => TValue | undefined
): TValue[] => ids
  .map((id) => read(id))
  .filter((value): value is TValue => value !== undefined)
