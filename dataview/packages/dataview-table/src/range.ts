import type {
  ItemList,
  FieldList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import { sameCellRef } from '@dataview/engine'
import {
  grid
} from '#dataview-table/grid'
import {
  type GridSelection
} from '#dataview-table/gridSelection'

export interface TableCellRange {
  anchor: CellRef
  focus: CellRef
}

export interface TableCellRangeEdges {
  rowStart: number
  rowEnd: number
  fieldStart: number
  fieldEnd: number
}

const from = (
  selection: GridSelection | null
): TableCellRange | undefined => selection
  ? {
      anchor: selection.anchor,
      focus: selection.focus
    }
  : undefined

const equal = (
  left: TableCellRange,
  right: TableCellRange
) => sameCellRef(left.anchor, right.anchor) && sameCellRef(left.focus, right.focus)

const edges = (
  currentRange: TableCellRange,
  items: Pick<ItemList, 'indexOf'>,
  fields: Pick<FieldList, 'indexOf'>
): TableCellRangeEdges | undefined => {
  const anchorRowIndex = grid.appearanceIndex(items, currentRange.anchor.itemId)
  const focusRowIndex = grid.appearanceIndex(items, currentRange.focus.itemId)
  const anchorFieldIndex = grid.fieldIndex(fields, currentRange.anchor.fieldId)
  const focusFieldIndex = grid.fieldIndex(fields, currentRange.focus.fieldId)

  if (
    anchorRowIndex === undefined
    || focusRowIndex === undefined
    || anchorFieldIndex === undefined
    || focusFieldIndex === undefined
  ) {
    return undefined
  }

  return {
    rowStart: Math.min(anchorRowIndex, focusRowIndex),
    rowEnd: Math.max(anchorRowIndex, focusRowIndex),
    fieldStart: Math.min(anchorFieldIndex, focusFieldIndex),
    fieldEnd: Math.max(anchorFieldIndex, focusFieldIndex)
  }
}

const items = (
  currentRange: TableCellRange,
  source: Pick<ItemList, 'indexOf' | 'ids'>
) => grid.appearancesBetween(source, currentRange.anchor.itemId, currentRange.focus.itemId)

const fields = (
  currentRange: TableCellRange,
  source: Pick<FieldList, 'indexOf' | 'ids'>
) => grid.fieldsBetween(source, currentRange.anchor.fieldId, currentRange.focus.fieldId)

const hasCell = (
  currentRange: TableCellRange,
  appearancesSource: Pick<ItemList, 'indexOf'>,
  propertiesSource: Pick<FieldList, 'indexOf'>,
  cell: CellRef
) => {
  const currentEdges = edges(currentRange, appearancesSource, propertiesSource)
  const rowIndex = grid.appearanceIndex(appearancesSource, cell.itemId)
  const fieldIndex = grid.fieldIndex(propertiesSource, cell.fieldId)
  return currentEdges !== undefined
    && rowIndex !== undefined
    && fieldIndex !== undefined
    && rowIndex >= currentEdges.rowStart
    && rowIndex <= currentEdges.rowEnd
    && fieldIndex >= currentEdges.fieldStart
    && fieldIndex <= currentEdges.fieldEnd
}

const isSingle = (
  currentRange: TableCellRange,
  appearancesSource: Pick<ItemList, 'indexOf'>,
  propertiesSource: Pick<FieldList, 'indexOf'>
) => {
  const currentEdges = edges(currentRange, appearancesSource, propertiesSource)
  return Boolean(
    currentEdges
    && currentEdges.rowStart === currentEdges.rowEnd
    && currentEdges.fieldStart === currentEdges.fieldEnd
  )
}

export const range = {
  from,
  equal,
  edges,
  items,
  fields,
  hasCell,
  isSingle
} as const
