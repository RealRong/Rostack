import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import { collection, store } from '@shared/core'
import type {
  OrderedSelectionDomain,
  SelectionDomainSource
} from '@dataview/runtime/selection/types'

export const createItemListSelectionDomain = (
  items: Pick<ItemList, 'order'>
): OrderedSelectionDomain<ItemId> => items.order

export const createItemArraySelectionDomain = (
  ids: readonly ItemId[]
): OrderedSelectionDomain<ItemId> => collection.createOrderedAccess(ids)

export const createItemSelectionDomainSource = (input: {
  store: store.ReadStore<Pick<ItemList, 'order'> | undefined>
}): SelectionDomainSource<ItemId> => ({
  get: () => {
    const items = store.read(input.store)
    return items
      ? createItemListSelectionDomain(items)
      : undefined
  },
  subscribe: input.store.subscribe
})
