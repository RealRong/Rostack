import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import type {
  SelectionScope
} from '@dataview/react/runtime/selection/types'

export const createItemListSelectionScope = (input: {
  key: string
  items: ItemList
}): SelectionScope<ItemId> => ({
  key: input.key,
  revision: input.items.ids,
  count: input.items.count,
  has: input.items.has,
  iterate: () => input.items.ids.values()
})

export const createItemArraySelectionScope = (input: {
  key: string
  ids: readonly ItemId[]
}): SelectionScope<ItemId> => {
  let idSet: ReadonlySet<ItemId> | null = null

  return {
    key: input.key,
    revision: input.ids,
    count: input.ids.length,
    has: id => {
      if (!idSet) {
        idSet = new Set(input.ids)
      }

      return idSet.has(id)
    },
    iterate: () => input.ids.values()
  }
}
