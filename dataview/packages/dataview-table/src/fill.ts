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

export const fillHandleCell = (input: {
  selection: GridSelection | null
  items: Pick<ItemList, 'order'>
  fields: Pick<FieldList, 'range'>
}): CellRef | undefined => {
  if (!input.selection) {
    return undefined
  }

  const rowIds = gridSelection.itemIds(input.selection, input.items)
  const fieldIds = gridSelection.fieldIds(input.selection, input.fields)

  if (rowIds.length !== 1 || !fieldIds.length) {
    return undefined
  }

  return input.selection.focus
}

export const canFill = (input: {
  selection: GridSelection | null
  items: Pick<ItemList, 'order'>
  fields: Pick<FieldList, 'range'>
}) => Boolean(fillHandleCell(input))

export const planFill = (input: {
  selection: GridSelection | null
  items: Pick<ItemList, 'order'>
  fields: Pick<FieldList, 'range'>
  read: (cell: CellRef) => {
    exists: boolean
    value: unknown
  }
}): TableFillEntry[] => {
  if (!input.selection) {
    return []
  }

  const selection = input.selection
  const fieldIds = gridSelection.fieldIds(selection, input.fields)
  const targetAppearanceIds = gridSelection.itemIds(selection, input.items)
    .filter(itemId => itemId !== selection.anchor.itemId)

  if (!fieldIds.length || !targetAppearanceIds.length) {
    return []
  }

  return targetAppearanceIds.flatMap(itemId => (
    fieldIds.map(fieldId => ({
      cell: {
        itemId,
        fieldId
      },
      value: input.read({
        itemId: selection.anchor.itemId,
        fieldId
      }).value
    }))
  ))
}
