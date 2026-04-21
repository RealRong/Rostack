import { selection } from '@shared/core'
import type {
  FieldList,
  ItemId,
  ItemList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  sameCellRef
} from '@dataview/engine'
import {
  cellNavigation
} from '@dataview/table/cellNavigation'

export interface GridSelection {
  focus: CellRef
  anchor: CellRef
}

export interface GridSelectionEdges {
  rowStart: number
  rowEnd: number
  fieldStart: number
  fieldEnd: number
}

const equal = (
  left: GridSelection | null,
  right: GridSelection | null
) => selection.sameAnchorFocusPair(left, right, sameCellRef)

const set = (
  focus: CellRef,
  anchor: CellRef = focus
): GridSelection => selection.createAnchorFocusPair(focus, anchor)

const focus = (
  current: GridSelection | null
): CellRef | undefined => current?.focus

const anchor = (
  current: GridSelection | null
): CellRef | undefined => current?.anchor

const edges = (
  current: GridSelection,
  items: Pick<ItemList, 'ids'>,
  fields: Pick<FieldList, 'ids'>
): GridSelectionEdges | undefined => {
  const rowEdges = selection.orderedRangeEdges(
    items.ids,
    current.anchor.itemId,
    current.focus.itemId
  )
  const fieldEdges = selection.orderedRangeEdges(
    fields.ids,
    current.anchor.fieldId,
    current.focus.fieldId
  )
  if (!rowEdges || !fieldEdges) {
    return undefined
  }

  return {
    rowStart: rowEdges.start,
    rowEnd: rowEdges.end,
    fieldStart: fieldEdges.start,
    fieldEnd: fieldEdges.end
  }
}

const itemIds = (
  current: GridSelection,
  items: Pick<ItemList, 'ids'>
) => selection.orderedRange(items.ids, current.anchor.itemId, current.focus.itemId)

const fieldIds = (
  current: GridSelection,
  fields: Pick<FieldList, 'ids'>
) => selection.orderedRange(fields.ids, current.anchor.fieldId, current.focus.fieldId)

const containsCell = (
  current: GridSelection,
  items: Pick<ItemList, 'ids'>,
  fields: Pick<FieldList, 'ids'>,
  cell: CellRef
) => {
  const currentEdges = edges(current, items, fields)
  const rowIndex = items.ids.indexOf(cell.itemId)
  const fieldIndex = fields.ids.indexOf(cell.fieldId)

  return currentEdges !== undefined
    && rowIndex !== -1
    && fieldIndex !== -1
    && rowIndex >= currentEdges.rowStart
    && rowIndex <= currentEdges.rowEnd
    && fieldIndex >= currentEdges.fieldStart
    && fieldIndex <= currentEdges.fieldEnd
}

const isSingle = (
  current: GridSelection,
  items: Pick<ItemList, 'ids'>,
  fields: Pick<FieldList, 'ids'>
) => {
  const currentEdges = edges(current, items, fields)
  return Boolean(
    currentEdges
    && currentEdges.rowStart === currentEdges.rowEnd
    && currentEdges.fieldStart === currentEdges.fieldEnd
  )
}

const reconcile = (
  current: GridSelection | null,
  items: Pick<ItemList, 'has' | 'indexOf' | 'ids' | 'at'>,
  fields: Pick<FieldList, 'has' | 'ids' | 'at'>
): GridSelection | null => {
  if (!current || !items.has(current.focus.itemId)) {
    return null
  }

  const focusCell = fields.has(current.focus.fieldId)
    ? current.focus
    : cellNavigation.firstCell(items, fields, current.focus.itemId)
  if (!focusCell) {
    return null
  }

  const anchorCell = cellNavigation.hasCell(items, fields, current.anchor)
    ? current.anchor
    : focusCell

  return set(focusCell, anchorCell)
}

const first = (
  current: GridSelection | null,
  items: Pick<ItemList, 'ids' | 'has' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  itemId?: ItemId
): GridSelection | undefined => {
  const targetCell = cellNavigation.firstCell(
    items,
    fields,
    itemId ?? current?.focus.itemId
  )

  return targetCell
    ? set(targetCell)
    : undefined
}

const move = (
  current: GridSelection | null,
  rowDelta: number,
  columnDelta: number,
  items: Pick<ItemList, 'ids' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'indexOf' | 'at'>,
  options?: {
    extend?: boolean
    wrap?: boolean
  }
): GridSelection | undefined => {
  if (!current || !items.ids.length || !fields.ids.length) {
    return undefined
  }

  const nextFocus = cellNavigation.stepCell(
    items,
    fields,
    options?.extend
      ? current.focus
      : current.anchor,
    {
      rowDelta,
      columnDelta,
      wrap: options?.wrap
    }
  )
  if (!nextFocus) {
    return undefined
  }

  return options?.extend
    ? set(nextFocus, current.anchor)
    : set(nextFocus)
}

export const gridSelection = {
  equal,
  set,
  focus,
  anchor,
  edges,
  itemIds,
  fieldIds,
  containsCell,
  isSingle,
  reconcile,
  first,
  move
} as const
