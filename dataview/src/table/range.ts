import type {
  AppearanceList,
  CellRef,
  FieldList
} from '@dataview/engine/projection/view'
import { sameCellRef } from '@dataview/engine/projection/view'
import {
  grid
} from './grid'
import {
  type GridSelection
} from './gridSelection'

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
  appearances: Pick<AppearanceList, 'indexOf'>,
  fields: Pick<FieldList, 'indexOf'>
): TableCellRangeEdges | undefined => {
  const anchorRowIndex = grid.appearanceIndex(appearances, currentRange.anchor.appearanceId)
  const focusRowIndex = grid.appearanceIndex(appearances, currentRange.focus.appearanceId)
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

const appearances = (
  currentRange: TableCellRange,
  source: Pick<AppearanceList, 'indexOf' | 'ids'>
) => grid.appearancesBetween(source, currentRange.anchor.appearanceId, currentRange.focus.appearanceId)

const fields = (
  currentRange: TableCellRange,
  source: Pick<FieldList, 'indexOf' | 'ids'>
) => grid.fieldsBetween(source, currentRange.anchor.fieldId, currentRange.focus.fieldId)

const hasCell = (
  currentRange: TableCellRange,
  appearancesSource: Pick<AppearanceList, 'indexOf'>,
  propertiesSource: Pick<FieldList, 'indexOf'>,
  cell: CellRef
) => {
  const currentEdges = edges(currentRange, appearancesSource, propertiesSource)
  const rowIndex = grid.appearanceIndex(appearancesSource, cell.appearanceId)
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
  appearancesSource: Pick<AppearanceList, 'indexOf'>,
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
  appearances,
  fields,
  hasCell,
  isSingle
} as const
