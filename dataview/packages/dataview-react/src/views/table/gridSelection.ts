import type {
  ItemId
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import type {
  TableGrid
} from '@dataview/runtime'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table'
import { store as coreStore } from '@shared/core'


export interface GridSelectionStore {
  store: coreStore.ValueStore<GridSelection | null>
  get: () => GridSelection | null
  clear: () => void
  set: (cell: CellRef, anchor?: CellRef) => void
  move: (
    rowDelta: number,
    columnDelta: number,
    options?: {
      extend?: boolean
      wrap?: boolean
    }
  ) => void
  first: (rowId?: ItemId) => void
  dispose: () => void
}

export const createGridSelection = (
  gridStore: coreStore.ReadStore<TableGrid | undefined>
): GridSelectionStore => {
  const selectionStore = coreStore.createValueStore<GridSelection | null>({
    initial: null,
    isEqual: gridSelection.equal
  })
  const getGrid = () => coreStore.peek(gridStore)
  const unsubscribe = gridStore.subscribe(() => {
    const grid = coreStore.read(gridStore)
    selectionStore.update(current => grid
      ? gridSelection.reconcile(
          current,
          grid.items,
          grid.fields
        )
      : null
    )
  })

  return {
    store: selectionStore,
    get: () => coreStore.peek(selectionStore),
    clear: () => {
      selectionStore.set(null)
    },
    set: (cell, anchor) => {
      selectionStore.set(gridSelection.set(cell, anchor))
    },
    move: (rowDelta, columnDelta, options) => {
      const grid = getGrid()
      if (!grid) {
        return
      }

      selectionStore.update(current => gridSelection.move(
        current,
        rowDelta,
        columnDelta,
        grid.items,
        grid.fields,
        options
      ) ?? current)
    },
    first: rowId => {
      const grid = getGrid()
      if (!grid) {
        return
      }

      selectionStore.update(current => gridSelection.first(
        current,
        grid.items,
        grid.fields,
        rowId
      ) ?? null)
    },
    dispose: unsubscribe
  }
}
