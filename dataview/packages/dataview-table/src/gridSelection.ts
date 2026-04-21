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
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'indexOf'>
): GridSelectionEdges | undefined => {
  const anchorRow = items.order.indexOf(current.anchor.itemId)
  const focusRow = items.order.indexOf(current.focus.itemId)
  const anchorField = fields.indexOf(current.anchor.fieldId)
  const focusField = fields.indexOf(current.focus.fieldId)
  if (
    anchorRow === undefined
    || focusRow === undefined
    || anchorField === undefined
    || focusField === undefined
  ) {
    return undefined
  }

  return {
    rowStart: Math.min(anchorRow, focusRow),
    rowEnd: Math.max(anchorRow, focusRow),
    fieldStart: Math.min(anchorField, focusField),
    fieldEnd: Math.max(anchorField, focusField)
  }
}

const itemIds = (
  current: GridSelection,
  items: Pick<ItemList, 'order'>
) => items.order.range(current.anchor.itemId, current.focus.itemId)

const fieldIds = (
  current: GridSelection,
  fields: Pick<FieldList, 'range'>
) => fields.range(current.anchor.fieldId, current.focus.fieldId)

const containsCell = (
  current: GridSelection,
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'indexOf'>,
  cell: CellRef
) => {
  const currentEdges = edges(current, items, fields)
  const rowIndex = items.order.indexOf(cell.itemId)
  const fieldIndex = fields.indexOf(cell.fieldId)

  return currentEdges !== undefined
    && rowIndex !== undefined
    && fieldIndex !== undefined
    && rowIndex >= currentEdges.rowStart
    && rowIndex <= currentEdges.rowEnd
    && fieldIndex >= currentEdges.fieldStart
    && fieldIndex <= currentEdges.fieldEnd
}

const isSingle = (
  current: GridSelection,
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'indexOf'>
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
  items: Pick<ItemList, 'count' | 'order'>,
  fields: Pick<FieldList, 'has' | 'count' | 'at'>
): GridSelection | null => {
  if (!current || !items.order.has(current.focus.itemId)) {
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
  items: Pick<ItemList, 'count' | 'order'>,
  fields: Pick<FieldList, 'count' | 'at'>,
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
  items: Pick<ItemList, 'count' | 'order'>,
  fields: Pick<FieldList, 'count' | 'indexOf' | 'at'>,
  options?: {
    extend?: boolean
    wrap?: boolean
  }
): GridSelection | undefined => {
  if (!current || !items.count || !fields.count) {
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
