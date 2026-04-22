import { store } from '@shared/core'
import type { CellRef } from '@dataview/engine'
import type {
  TableGrid
} from '@dataview/runtime'
import { fill, type GridSelection } from '@dataview/table'
import { sameOptionalCell, tableCellKey } from '@dataview/react/views/table/runtime/cell'

export interface TableFillRuntime {
  handle: store.ReadStore<CellRef | undefined>
  cell: store.KeyedReadStore<CellRef, boolean>
  dispose: () => void
}

export const createTableFillRuntime = (input: {
  gridSelectionStore: store.ReadStore<GridSelection | null>
  gridStore: store.ReadStore<TableGrid | undefined>
  enabledStore: store.ReadStore<boolean>
}): TableFillRuntime => {
  const handle = store.createDerivedStore<CellRef | undefined>({
    get: () => {
      if (!store.read(input.enabledStore)) {
        return undefined
      }

      const grid = store.read(input.gridStore)
      if (!grid) {
        return undefined
      }

      return fill.handleCell(
        store.read(input.gridSelectionStore),
        grid.items,
        grid.fields
      )
    },
    isEqual: sameOptionalCell
  })
  const state = store.createKeyedStore<string, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const cell = store.createKeyedDerivedStore<CellRef, boolean>({
    keyOf: tableCellKey,
    get: current => store.read(state, tableCellKey(current)),
    isEqual: Object.is
  })

  let currentKey = handle.get()
    ? tableCellKey(handle.get()!)
    : undefined
  if (currentKey) {
    state.set(currentKey, true)
  }

  const sync = () => {
    const next = handle.get()
    const nextKey = next
      ? tableCellKey(next)
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
