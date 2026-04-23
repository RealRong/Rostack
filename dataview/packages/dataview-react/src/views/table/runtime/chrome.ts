import { store } from '@shared/core'
import type { CellRef, ItemId } from '@dataview/engine'
import { tableCellKey } from '@dataview/runtime'

export interface TableRowChrome {
  selected: boolean
  exposed: boolean
  canDrag: boolean
}

export interface TableCellChrome {
  selected: boolean
  focus: boolean
  hover: boolean
  fill: boolean
}

const sameRowChrome = (
  left: TableRowChrome,
  right: TableRowChrome
) => left.selected === right.selected
  && left.exposed === right.exposed
  && left.canDrag === right.canDrag

const sameCellChrome = (
  left: TableCellChrome,
  right: TableCellChrome
) => left.selected === right.selected
  && left.focus === right.focus
  && left.hover === right.hover
  && left.fill === right.fill

export const createTableChromeRuntime = (input: {
  rowSelected: store.KeyedReadStore<ItemId, boolean>
  rowExposed: store.KeyedReadStore<ItemId, boolean>
  canRowDrag: store.ReadStore<boolean>
  cellSelected: store.KeyedReadStore<CellRef, boolean>
  cellFocus: store.KeyedReadStore<CellRef, boolean>
  cellHover: store.KeyedReadStore<CellRef, boolean>
  cellFill: store.KeyedReadStore<CellRef, boolean>
  selectionVisible: store.ReadStore<boolean>
}): {
  row: store.KeyedReadStore<ItemId, TableRowChrome>
  cell: store.KeyedReadStore<CellRef, TableCellChrome>
} => ({
  row: store.createKeyedDerivedStore<ItemId, TableRowChrome>({
    keyOf: rowId => rowId,
    get: rowId => ({
      selected: store.read(input.rowSelected, rowId),
      exposed: store.read(input.rowExposed, rowId),
      canDrag: store.read(input.canRowDrag)
    }),
    isEqual: sameRowChrome
  }),
  cell: store.createKeyedDerivedStore<CellRef, TableCellChrome>({
    keyOf: tableCellKey,
    get: cell => {
      const rawSelected = store.read(input.cellSelected, cell)
      const visible = store.read(input.selectionVisible)
      return {
        selected: visible && rawSelected,
        focus: visible && store.read(input.cellFocus, cell),
        hover: store.read(input.cellHover, cell) && !rawSelected,
        fill: visible && store.read(input.cellFill, cell)
      }
    },
    isEqual: sameCellChrome
  })
})
