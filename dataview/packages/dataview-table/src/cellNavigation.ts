import type { FieldId } from '@dataview/core/contracts'
import type {
  CellRef,
  FieldList,
  ItemId,
  ItemList
} from '@dataview/engine'

const clampIndex = (
  value: number,
  max: number
) => {
  if (max <= 0) {
    return 0
  }

  return Math.max(0, Math.min(value, max - 1))
}

const hasCell = (
  items: Pick<ItemList, 'has'>,
  fields: Pick<FieldList, 'has'>,
  cell: CellRef
) => items.has(cell.itemId) && fields.has(cell.fieldId)

const cellAt = (
  items: Pick<ItemList, 'at'>,
  fields: Pick<FieldList, 'at'>,
  rowIndex: number,
  fieldIndex: number
): CellRef | undefined => {
  const itemId = items.at(rowIndex)
  const fieldId = fields.at(fieldIndex)
  return itemId && fieldId
    ? {
        itemId,
        fieldId
      }
    : undefined
}

const edgeCell = (
  items: Pick<ItemList, 'ids' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  itemId: ItemId,
  side: 'start' | 'end'
): CellRef | undefined => {
  const rowIndex = items.indexOf(itemId)
  if (rowIndex === undefined || !fields.ids.length) {
    return undefined
  }

  return cellAt(
    items,
    fields,
    rowIndex,
    side === 'start'
      ? 0
      : fields.ids.length - 1
  )
}

const firstCell = (
  items: Pick<ItemList, 'has' | 'ids' | 'at' | 'indexOf'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  rowId?: ItemId
): CellRef | undefined => {
  const nextRowId = rowId && items.has(rowId)
    ? rowId
    : items.at(0)

  return nextRowId
    ? edgeCell(items, fields, nextRowId, 'start')
    : undefined
}

const stepCell = (
  items: Pick<ItemList, 'ids' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'indexOf' | 'at'>,
  cell: CellRef,
  options: {
    rowDelta: number
    columnDelta: number
    wrap?: boolean
  }
): CellRef | undefined => {
  const currentRowIndex = items.indexOf(cell.itemId)
  const currentFieldIndex = fields.indexOf(cell.fieldId)
  if (
    currentRowIndex === undefined
    || currentFieldIndex === undefined
    || !items.ids.length
    || !fields.ids.length
  ) {
    return undefined
  }

  let nextRowIndex = clampIndex(currentRowIndex + options.rowDelta, items.ids.length)
  let nextFieldIndex = clampIndex(currentFieldIndex + options.columnDelta, fields.ids.length)

  if (options.wrap && options.rowDelta === 0) {
    const rawFieldIndex = currentFieldIndex + options.columnDelta

    if (rawFieldIndex < 0) {
      nextRowIndex = clampIndex(currentRowIndex - 1, items.ids.length)
      nextFieldIndex = nextRowIndex === currentRowIndex
        ? 0
        : fields.ids.length - 1
    } else if (rawFieldIndex >= fields.ids.length) {
      nextRowIndex = clampIndex(currentRowIndex + 1, items.ids.length)
      nextFieldIndex = nextRowIndex === currentRowIndex
        ? fields.ids.length - 1
        : 0
    } else {
      nextFieldIndex = rawFieldIndex
    }
  }

  return cellAt(
    items,
    fields,
    nextRowIndex,
    nextFieldIndex
  )
}

export const cellNavigation = {
  hasCell,
  cellAt,
  edgeCell,
  firstCell,
  stepCell
} as const

export type TableCellFieldId = FieldId
