import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import type {
  ValueStore
} from '@shared/core'

export interface Selection {
  ids: readonly ItemId[]
  anchor?: ItemId
  focus?: ItemId
}

export interface SelectionStore extends ValueStore<Selection> { }

export interface SelectionApi {
  store: SelectionStore
  get(): Selection
  clear(): void
  all(): void
  set(
    ids: readonly ItemId[],
    options?: {
      anchor?: ItemId
      focus?: ItemId
    }
  ): void
  toggle(ids: readonly ItemId[]): void
  extend(to: ItemId): void
}

export interface SelectionScope {
  items: () => ItemList | undefined
}
