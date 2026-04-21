import type {
  ItemList,
  FieldList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table/gridSelection'

export interface TableFillEntry {
  cell: CellRef
  value: unknown | undefined
}

const handleCell = (
  current: GridSelection | null,
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'range'>
): CellRef | undefined => {
  if (!current) {
    return undefined
  }

  const rowIds = gridSelection.itemIds(current, items)
  const fieldIds = gridSelection.fieldIds(current, fields)

  if (rowIds.length !== 1 || !fieldIds.length) {
    return undefined
  }

  return current.focus
}

const can = (
  current: GridSelection | null,
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'range'>
) => Boolean(handleCell(current, items, fields))

const plan = (
  current: GridSelection | null,
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'range'>,
  read: (cell: CellRef) => {
    exists: boolean
    value: unknown
  }
): TableFillEntry[] => {
  if (!current) {
    return []
  }

  const fieldIds = gridSelection.fieldIds(current, fields)
  const targetAppearanceIds = gridSelection.itemIds(current, items)
    .filter(itemId => itemId !== current.anchor.itemId)

  if (!fieldIds.length || !targetAppearanceIds.length) {
    return []
  }

  return targetAppearanceIds.flatMap(itemId => (
    fieldIds.map(fieldId => ({
      cell: {
        itemId,
        fieldId
      },
      value: read({
        itemId: current.anchor.itemId,
        fieldId
      }).value
    }))
  ))
}

export const fill = {
  can,
  handleCell,
  plan
} as const
