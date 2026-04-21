import { store } from '@shared/core'
import type { ItemId } from '@dataview/engine'

export interface TableRailRuntime {
  active: store.ReadStore<ItemId | null>
  row: store.KeyedReadStore<ItemId, boolean>
  set: (rowId: ItemId | null) => void
}

export const createTableRailRuntime = (): TableRailRuntime => {
  const active = store.createValueStore<ItemId | null>({
    initial: null,
    isEqual: Object.is
  })

  return {
    active,
    row: store.createKeyedDerivedStore<ItemId, boolean>({
      keyOf: rowId => rowId,
      get: rowId => store.read(active) === rowId,
      isEqual: Object.is
    }),
    set: active.set
  }
}
