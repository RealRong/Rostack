import {
  createDerivedStore,
  createKeyedDerivedStore,
  createKeyedStore,
  joinUnsubscribes,
  read,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { CellRef, ViewState as CurrentView } from '@dataview/engine'
import { fill, type GridSelection } from '@dataview/table'
import { sameOptionalCell, tableCellKey } from '@dataview/react/views/table/runtime/cell'

export interface TableFillRuntime {
  handle: ReadStore<CellRef | undefined>
  cell: KeyedReadStore<CellRef, boolean>
  dispose: () => void
}

export const createTableFillRuntime = (input: {
  gridSelectionStore: ReadStore<GridSelection | null>
  currentViewStore: ReadStore<CurrentView | undefined>
  enabledStore: ReadStore<boolean>
}): TableFillRuntime => {
  const handle = createDerivedStore<CellRef | undefined>({
    get: () => {
      if (!read(input.enabledStore)) {
        return undefined
      }

      const currentView = read(input.currentViewStore)
      if (!currentView) {
        return undefined
      }

      return fill.handleCell(
        read(input.gridSelectionStore),
        currentView.items,
        currentView.fields
      )
    },
    isEqual: sameOptionalCell
  })
  const state = createKeyedStore<string, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const cell = createKeyedDerivedStore<CellRef, boolean>({
    keyOf: tableCellKey,
    get: current => read(state, tableCellKey(current)),
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
    dispose: joinUnsubscribes([
      handle.subscribe(sync)
    ])
  }
}
