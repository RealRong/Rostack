import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import type {
  ReadStore
} from '@shared/core'
import type {
  OrderedSelectionDomain,
  SelectionDomainSource
} from '@dataview/react/runtime/selection/types'

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

  return {
    count: ids.length,
    has: id => {
      if (!idSet) {
        idSet = new Set(ids)
      }

      return idSet.has(id)
    },
    indexOf: id => {
      const index = ids.indexOf(id)
      return index === -1
        ? undefined
        : index
    },
    at: index => ids[index],
    prev: id => {
      const index = ids.indexOf(id)
      return index > 0
        ? ids[index - 1]
        : undefined
    },
    next: id => {
      const index = ids.indexOf(id)
      return index >= 0
        ? ids[index + 1]
        : undefined
    },
    range: (anchor, focus) => {
      const anchorIndex = ids.indexOf(anchor)
      const focusIndex = ids.indexOf(focus)
      if (anchorIndex === -1 || focusIndex === -1) {
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
    const items = input.store.get()
    return items
      ? createItemListSelectionDomain(items)
      : undefined
  },
  subscribe: input.store.subscribe
})
