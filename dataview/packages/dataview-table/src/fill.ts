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
  items: Pick<ItemList, 'indexOf' | 'ids'>,
  fields: Pick<FieldList, 'indexOf' | 'ids'>
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
  items: Pick<ItemList, 'indexOf' | 'ids'>,
  fields: Pick<FieldList, 'indexOf' | 'ids'>
) => Boolean(handleCell(current, items, fields))

const plan = (
  current: GridSelection | null,
  items: Pick<ItemList, 'indexOf' | 'ids'>,
  fields: Pick<FieldList, 'indexOf' | 'ids'>,
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
