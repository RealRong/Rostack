import { store } from '@shared/core'
import type { CellRef } from '@dataview/engine'
import type {
  ItemList
} from '@dataview/engine'
import { fillHandleCell, type GridSelection } from '@dataview/table'
import {
  cellId,
  sameOptionalCell,
  type CellId
} from '@dataview/runtime'
import type { TableDisplayedFields } from '@dataview/react/views/table/displayFields'

export interface TableFillRuntime {
  handle: store.ReadStore<CellRef | undefined>
  cell: store.KeyedReadStore<CellRef, boolean>
  dispose: () => void
}

export const createTableFillRuntime = (input: {
  gridSelectionStore: store.ReadStore<GridSelection | null>
  itemsStore: store.ReadStore<ItemList>
  fieldsStore: store.ReadStore<TableDisplayedFields | undefined>
  enabledStore: store.ReadStore<boolean>
}): TableFillRuntime => {
  const handle = store.createDerivedStore<CellRef | undefined>({
    get: () => {
      if (!store.read(input.enabledStore)) {
        return undefined
      }

      const fields = store.read(input.fieldsStore)
      if (!fields) {
        return undefined
      }

      return fillHandleCell({
        selection: store.read(input.gridSelectionStore),
        items: store.read(input.itemsStore),
        fields
      })
    },
    isEqual: sameOptionalCell
  })
  const state = store.createKeyedStore<CellId, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const cell = store.createKeyedDerivedStore<CellRef, boolean>({
    keyOf: cellId,
    get: current => store.read(state, cellId(current)),
    isEqual: Object.is
  })

  const readHandle = () => store.peek(handle)
  let currentKey = readHandle()
    ? cellId(readHandle()!)
    : undefined
  if (currentKey) {
    state.set(currentKey, true)
  }

  const sync = () => {
    const next = readHandle()
    const nextKey = next
      ? cellId(next)
      : undefined
    if (currentKey === nextKey) {
      return
    }

    const set: Array<readonly [string, boolean]> = []
    if (currentKey) {
      set.push([currentKey, false] as const)
    }
    if (nextKey) {
      set.push([nextKey, true] as const)
    }
    if (set.length) {
      state.patch({
        set
      })
    }
    currentKey = nextKey
  }

  return {
    handle,
    cell,
    dispose: store.joinUnsubscribes([
      handle.subscribe(sync)
    ])
  }
}
