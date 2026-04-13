import type {
  ItemId,
  ItemList,
  FieldList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import { sameCellRef } from '@dataview/engine'
import {
  grid
} from '#table/grid.ts'

export interface GridSelection {
  focus: CellRef
  anchor: CellRef
}

const equal = (
  left: GridSelection | null,
  right: GridSelection | null
) => {
  if (!left || !right) {
    return left === right
  }

  return sameCellRef(left.focus, right.focus) && sameCellRef(left.anchor, right.anchor)
}

const set = (
  focus: CellRef,
  anchor: CellRef = focus
): GridSelection => ({
  focus,
  anchor
})

const focus = (
  current: GridSelection | null
): CellRef | undefined => current?.focus

const anchor = (
  current: GridSelection | null
): CellRef | undefined => current?.anchor

const reconcile = (
  current: GridSelection | null,
  items: Pick<ItemList, 'has' | 'indexOf' | 'ids' | 'at'>,
  fields: Pick<FieldList, 'has' | 'ids' | 'at'>
): GridSelection | null => {
  if (!current) {
    return null
  }

  if (!items.has(current.focus.itemId)) {
    return null
  }

  const focusCell = fields.has(current.focus.fieldId)
    ? current.focus
    : grid.firstCell(items, fields, current.focus.itemId)
  if (!focusCell) {
    return null
  }

  const anchorCell = (
    items.has(current.anchor.itemId)
    && fields.has(current.anchor.fieldId)
  )
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
  const targetCell = grid.firstCell(
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

  const nextFocus = grid.stepField(
    items,
    fields,
    options?.extend ? current.focus : current.anchor,
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
  reconcile,
  first,
  move
} as const
