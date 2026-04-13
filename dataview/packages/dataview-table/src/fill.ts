import type {
  ItemList,
  FieldList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  range
} from '#table/range'
import {
  type GridSelection
} from '#table/gridSelection'

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

  const currentRange = range.from(current)
  const rowIds = currentRange ? range.items(currentRange, items) : []
  const fieldIds = currentRange ? range.fields(currentRange, fields) : []

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

  const currentRange = range.from(current)
  if (!currentRange) {
    return []
  }

  const fieldIds = range.fields(currentRange, fields)
  const targetAppearanceIds = range.items(currentRange, items)
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
