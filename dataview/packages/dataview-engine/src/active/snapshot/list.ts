const EMPTY_IDS = [] as readonly string[]

export interface OrderedListAccess<TId extends string> {
  has: (id: TId) => boolean
  indexOf: (id: TId) => number | undefined
  at: (index: number) => TId | undefined
  prev: (id: TId) => TId | undefined
  next: (id: TId) => TId | undefined
  range: (anchor: TId, focus: TId) => readonly TId[]
}

export const createOrderedListAccess = <TId extends string>(
  ids: readonly TId[]
): OrderedListAccess<TId> => {
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
        return EMPTY_IDS as readonly TId[]
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    }
  }
}
