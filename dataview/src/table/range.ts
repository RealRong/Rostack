import type {
  AppearanceList,
  FieldId,
  PropertyList
} from '@/engine/projection/view'
import { sameField } from '@/engine/projection/view'
import {
  grid
} from './grid'
import {
  type GridSelection
} from './gridSelection'

export interface TableCellRange {
  anchor: FieldId
  focus: FieldId
}

export interface TableCellRangeEdges {
  rowStart: number
  rowEnd: number
  propertyStart: number
  propertyEnd: number
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
) => sameField(left.anchor, right.anchor) && sameField(left.focus, right.focus)

const edges = (
  currentRange: TableCellRange,
  appearances: Pick<AppearanceList, 'indexOf'>,
  properties: Pick<PropertyList, 'indexOf'>
): TableCellRangeEdges | undefined => {
  const anchorRowIndex = grid.appearanceIndex(appearances, currentRange.anchor.appearanceId)
  const focusRowIndex = grid.appearanceIndex(appearances, currentRange.focus.appearanceId)
  const anchorPropertyIndex = grid.propertyIndex(properties, currentRange.anchor.propertyId)
  const focusPropertyIndex = grid.propertyIndex(properties, currentRange.focus.propertyId)

  if (
    anchorRowIndex === undefined
    || focusRowIndex === undefined
    || anchorPropertyIndex === undefined
    || focusPropertyIndex === undefined
  ) {
    return undefined
  }

  return {
    rowStart: Math.min(anchorRowIndex, focusRowIndex),
    rowEnd: Math.max(anchorRowIndex, focusRowIndex),
    propertyStart: Math.min(anchorPropertyIndex, focusPropertyIndex),
    propertyEnd: Math.max(anchorPropertyIndex, focusPropertyIndex)
  }
}

const appearances = (
  currentRange: TableCellRange,
  source: Pick<AppearanceList, 'indexOf' | 'ids'>
) => grid.appearancesBetween(source, currentRange.anchor.appearanceId, currentRange.focus.appearanceId)

const properties = (
  currentRange: TableCellRange,
  source: Pick<PropertyList, 'indexOf' | 'ids'>
) => grid.propertiesBetween(source, currentRange.anchor.propertyId, currentRange.focus.propertyId)

const hasCell = (
  currentRange: TableCellRange,
  appearancesSource: Pick<AppearanceList, 'indexOf'>,
  propertiesSource: Pick<PropertyList, 'indexOf'>,
  cell: FieldId
) => {
  const currentEdges = edges(currentRange, appearancesSource, propertiesSource)
  const rowIndex = grid.appearanceIndex(appearancesSource, cell.appearanceId)
  const propertyIndex = grid.propertyIndex(propertiesSource, cell.propertyId)
  return currentEdges !== undefined
    && rowIndex !== undefined
    && propertyIndex !== undefined
    && rowIndex >= currentEdges.rowStart
    && rowIndex <= currentEdges.rowEnd
    && propertyIndex >= currentEdges.propertyStart
    && propertyIndex <= currentEdges.propertyEnd
}

const isSingle = (
  currentRange: TableCellRange,
  appearancesSource: Pick<AppearanceList, 'indexOf'>,
  propertiesSource: Pick<PropertyList, 'indexOf'>
) => {
  const currentEdges = edges(currentRange, appearancesSource, propertiesSource)
  return Boolean(
    currentEdges
    && currentEdges.rowStart === currentEdges.rowEnd
    && currentEdges.propertyStart === currentEdges.propertyEnd
  )
}

export const range = {
  from,
  equal,
  edges,
  appearances,
  properties,
  hasCell,
  isSingle
} as const
