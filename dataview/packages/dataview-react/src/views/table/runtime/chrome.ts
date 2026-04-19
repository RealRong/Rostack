import {
  createKeyedDerivedStore,
  read,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { CellRef, ItemId } from '@dataview/engine'
import { tableCellKey } from '@dataview/react/views/table/runtime/cell'

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
  rowSelected: KeyedReadStore<ItemId, boolean>
  rowExposed: KeyedReadStore<ItemId, boolean>
  canRowDrag: ReadStore<boolean>
  cellSelected: KeyedReadStore<CellRef, boolean>
  cellFocus: KeyedReadStore<CellRef, boolean>
  cellHover: KeyedReadStore<CellRef, boolean>
  cellFill: KeyedReadStore<CellRef, boolean>
  selectionVisible: ReadStore<boolean>
}): {
  row: KeyedReadStore<ItemId, TableRowChrome>
  cell: KeyedReadStore<CellRef, TableCellChrome>
} => ({
  row: createKeyedDerivedStore<ItemId, TableRowChrome>({
    keyOf: rowId => rowId,
    get: rowId => ({
      selected: read(input.rowSelected, rowId),
      exposed: read(input.rowExposed, rowId),
      canDrag: read(input.canRowDrag)
    }),
    isEqual: sameRowChrome
  }),
  cell: createKeyedDerivedStore<CellRef, TableCellChrome>({
    keyOf: tableCellKey,
    get: cell => {
      const rawSelected = read(input.cellSelected, cell)
      const visible = read(input.selectionVisible)
      return {
        selected: visible && rawSelected,
        focus: visible && read(input.cellFocus, cell),
        hover: read(input.cellHover, cell) && !rawSelected,
        fill: visible && read(input.cellFill, cell)
      }
    },
    isEqual: sameCellChrome
  })
})
