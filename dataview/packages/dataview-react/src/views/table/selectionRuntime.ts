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
  ItemSelectionController,
  ItemSelectionSnapshot
} from '@dataview/react/runtime/selection'

export type TableSelectionMode =
  | 'none'
  | 'rows'
  | 'cells'

export type TableRowSelectionApi = ItemSelectionController

export interface TableSelectionRuntime {
  mode: ReadStore<TableSelectionMode>
  rows: TableRowSelectionApi
  cells: GridSelectionStore
  clear: () => void
  dispose: () => void
}

const hasRows = (
  selection: ItemSelectionSnapshot
) => selection.selectedCount > 0

export const createTableSelectionRuntime = (input: {
  currentViewStore: ReadStore<CurrentView | undefined>
  rowSelection: ItemSelectionController
}): TableSelectionRuntime => {
  const baseCells = createGridSelection(input.currentViewStore)
  const clearRows = () => {
    if (!hasRows(input.rowSelection.state.getSnapshot())) {
      return
    }

    input.rowSelection.command.clear()
  }
  const clearCells = () => {
    if (!baseCells.get()) {
      return
    }

    baseCells.clear()
  }
  const rows: TableRowSelectionApi = {
    state: input.rowSelection.state,
    query: input.rowSelection.query,
    enumerate: input.rowSelection.enumerate,
    store: input.rowSelection.store,
    command: {
      restore: snapshot => {
        clearCells()
        input.rowSelection.command.restore(snapshot)
      },
      clear: input.rowSelection.command.clear,
      selectAll: () => {
        clearCells()
        input.rowSelection.command.selectAll()
      },
      ids: {
        replace: (ids, options) => {
          clearCells()
          input.rowSelection.command.ids.replace(ids, options)
        },
        add: ids => {
          clearCells()
          input.rowSelection.command.ids.add(ids)
        },
        remove: ids => {
          clearCells()
          input.rowSelection.command.ids.remove(ids)
        },
        toggle: ids => {
          clearCells()
          input.rowSelection.command.ids.toggle(ids)
        }
      },
      scope: {
        replace: (scope, options) => {
          clearCells()
          input.rowSelection.command.scope.replace(scope, options)
        },
        add: scope => {
          clearCells()
          input.rowSelection.command.scope.add(scope)
        },
        remove: scope => {
          clearCells()
          input.rowSelection.command.scope.remove(scope)
        },
        toggle: scope => {
          clearCells()
          input.rowSelection.command.scope.toggle(scope)
        }
      },
      range: {
        extendTo: id => {
          clearCells()
          input.rowSelection.command.range.extendTo(id)
        },
        step: (delta, options) => {
          clearCells()
          return input.rowSelection.command.range.step(delta, options)
        }
      }
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
        : hasRows(read(input.rowSelection.state.store))
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
      input.rowSelection.command.clear()
    },
    dispose: () => {
      baseCells.dispose()
    }
  }
}
