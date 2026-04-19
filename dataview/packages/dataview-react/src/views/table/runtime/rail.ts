import {
  createKeyedDerivedStore,
  createValueStore,
  read,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { ItemId } from '@dataview/engine'

export interface TableRailRuntime {
  active: ReadStore<ItemId | null>
  row: KeyedReadStore<ItemId, boolean>
  set: (rowId: ItemId | null) => void
}

export const createTableRailRuntime = (): TableRailRuntime => {
  const active = createValueStore<ItemId | null>({
    initial: null,
    isEqual: Object.is
  })

  return {
    active,
    row: createKeyedDerivedStore<ItemId, boolean>({
      keyOf: rowId => rowId,
      get: rowId => read(active) === rowId,
      isEqual: Object.is
    }),
    set: active.set
  }
}
