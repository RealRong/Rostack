import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import {
  read,
  type ReadStore
} from '@shared/core'
import type {
  OrderedSelectionDomain,
  SelectionDomainSource
} from '@dataview/runtime/selection/types'

export const createItemListSelectionDomain = (
  items: ItemList
): OrderedSelectionDomain<ItemId> => ({
  count: items.count,
  has: items.has,
  indexOf: items.indexOf,
  at: items.at,
  prev: items.prev,
  next: items.next,
  range: items.range,
  iterate: () => items.ids.values()
})

export const createItemArraySelectionDomain = (
  ids: readonly ItemId[]
): OrderedSelectionDomain<ItemId> => {
  let idSet: ReadonlySet<ItemId> | null = null
  let indexById: ReadonlyMap<ItemId, number> | null = null

  const ensureIndexById = () => {
    if (!indexById) {
      indexById = new Map(
        ids.map((id, index) => [id, index] as const)
      )
    }

    return indexById
  }

  const getIndex = (
    id: ItemId
  ) => ensureIndexById().get(id)

  return {
    count: ids.length,
    has: id => {
      if (!idSet) {
        idSet = new Set(ids)
      }

      return idSet.has(id)
    },
    indexOf: id => {
      const index = getIndex(id)
      return index === undefined ? undefined : index
    },
    at: index => ids[index],
    prev: id => {
      const index = getIndex(id)
      return index !== undefined && index > 0
        ? ids[index - 1]
        : undefined
    },
    next: id => {
      const index = getIndex(id)
      return index !== undefined
        ? ids[index + 1]
        : undefined
    },
    range: (anchor, focus) => {
      const anchorIndex = getIndex(anchor)
      const focusIndex = getIndex(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return []
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    },
    iterate: () => ids.values()
  }
}

export const createItemSelectionDomainSource = (input: {
  store: ReadStore<ItemList | undefined>
}): SelectionDomainSource<ItemId> => ({
  get: () => {
    const items = read(input.store)
    return items
      ? createItemListSelectionDomain(items)
      : undefined
  },
  subscribe: input.store.subscribe
})
