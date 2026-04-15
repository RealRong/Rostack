import type { ViewState as CurrentView } from '@dataview/engine'
import {
  createDerivedStore,
  read,
  type ReadStore
} from '@shared/core'
import {
  createGridSelection,
  type GridSelectionStore
} from '@dataview/react/views/table/gridSelection'
import type {
  Selection,
  SelectionApi
} from '@dataview/react/runtime/selection'

export type TableSelectionMode =
  | 'none'
  | 'rows'
  | 'cells'

export interface TableRowSelectionApi extends Pick<
  SelectionApi,
  'get' | 'clear' | 'all' | 'set' | 'toggle' | 'extend'
> {}

export interface TableSelectionRuntime {
  mode: ReadStore<TableSelectionMode>
  rows: TableRowSelectionApi
  cells: GridSelectionStore
  clear: () => void
  dispose: () => void
}

const hasRows = (
  selection: Selection
) => selection.ids.length > 0

export const createTableSelectionRuntime = (input: {
  currentViewStore: ReadStore<CurrentView | undefined>
  rowSelection: SelectionApi
  rowSelectionStore: ReadStore<Selection>
}): TableSelectionRuntime => {
  const baseCells = createGridSelection(input.currentViewStore)
  const clearRows = () => {
    if (!hasRows(input.rowSelection.get())) {
      return
    }

    input.rowSelection.clear()
  }
  const clearCells = () => {
    if (!baseCells.get()) {
      return
    }

    baseCells.clear()
  }
  const rows: TableRowSelectionApi = {
    get: input.rowSelection.get,
    clear: input.rowSelection.clear,
    all: () => {
      clearCells()
      input.rowSelection.all()
    },
    set: (ids, options) => {
      clearCells()
      input.rowSelection.set(ids, options)
    },
    toggle: ids => {
      clearCells()
      input.rowSelection.toggle(ids)
    },
    extend: to => {
      clearCells()
      input.rowSelection.extend(to)
    }
  }
  const cells: GridSelectionStore = {
    store: baseCells.store,
    get: baseCells.get,
    clear: baseCells.clear,
    set: (cell, anchor) => {
      clearRows()
      baseCells.set(cell, anchor)
    },
    move: (rowDelta, columnDelta, options) => {
      clearRows()
      baseCells.move(rowDelta, columnDelta, options)
    },
    first: rowId => {
      clearRows()
      baseCells.first(rowId)
    },
    dispose: baseCells.dispose
  }
  const mode = createDerivedStore<TableSelectionMode>({
    get: () => (
      read(cells.store)
        ? 'cells'
        : hasRows(read(input.rowSelectionStore))
          ? 'rows'
          : 'none'
    ),
    isEqual: Object.is
  })

  return {
    mode,
    rows,
    cells,
    clear: () => {
      baseCells.clear()
      input.rowSelection.clear()
    },
    dispose: () => {
      baseCells.dispose()
    }
  }
}
