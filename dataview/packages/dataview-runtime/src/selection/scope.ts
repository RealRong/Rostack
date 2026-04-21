import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import { collection } from '@shared/core'
import type {
  SelectionScope
} from '@dataview/runtime/selection/types'

export const createItemListSelectionScope = (input: {
  key: string
  items: ItemList
}): SelectionScope<ItemId> => ({
  key: input.key,
  revision: input.items.ids,
  count: input.items.count,
  has: input.items.order.has,
  iterate: input.items.order.iterate
})

export const createItemArraySelectionScope = (input: {
  key: string
  ids: readonly ItemId[]
}): SelectionScope<ItemId> => {
  const access = collection.createOrderedAccess(input.ids)

  return {
    key: input.key,
    revision: input.ids,
    count: access.count,
    has: access.has,
    iterate: access.iterate
  }
}
