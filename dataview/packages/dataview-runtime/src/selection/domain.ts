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

export const createItemSelectionDomainSource = <TItems extends Pick<ItemList, 'order'>>(input: {
  store: store.ReadStore<TItems>
}): SelectionDomainSource<ItemId> => ({
  get: () => createItemListSelectionDomain(store.read(input.store)),
  subscribe: input.store.subscribe
})
