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
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'has'>,
  cell: CellRef
) => items.order.has(cell.itemId) && fields.has(cell.fieldId)

const cellAt = (
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'at'>,
  rowIndex: number,
  fieldIndex: number
): CellRef | undefined => {
  const itemId = items.order.at(rowIndex)
  const fieldId = fields.at(fieldIndex)
  return itemId && fieldId
    ? {
        itemId,
        fieldId
      }
    : undefined
}

const edgeCell = (
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'count' | 'at'>,
  itemId: ItemId,
  side: 'start' | 'end'
): CellRef | undefined => {
  const rowIndex = items.order.indexOf(itemId)
  if (rowIndex === undefined || !fields.count) {
    return undefined
  }

  return cellAt(
    items,
    fields,
    rowIndex,
    side === 'start'
      ? 0
      : fields.count - 1
  )
}

const firstCell = (
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'count' | 'at'>,
  rowId?: ItemId
): CellRef | undefined => {
  const nextRowId = rowId && items.order.has(rowId)
    ? rowId
    : items.order.at(0)

  return nextRowId
    ? edgeCell(items, fields, nextRowId, 'start')
    : undefined
}

const stepCell = (
  items: Pick<ItemList, 'count' | 'order'>,
  fields: Pick<FieldList, 'count' | 'indexOf' | 'at'>,
  cell: CellRef,
  options: {
    rowDelta: number
    columnDelta: number
    wrap?: boolean
  }
): CellRef | undefined => {
  const currentRowIndex = items.order.indexOf(cell.itemId)
  const currentFieldIndex = fields.indexOf(cell.fieldId)
  if (
    currentRowIndex === undefined
    || currentFieldIndex === undefined
    || !items.count
    || !fields.count
  ) {
    return undefined
  }

  let nextRowIndex = clampIndex(currentRowIndex + options.rowDelta, items.count)
  let nextFieldIndex = clampIndex(currentFieldIndex + options.columnDelta, fields.count)

  if (options.wrap && options.rowDelta === 0) {
    const rawFieldIndex = currentFieldIndex + options.columnDelta

    if (rawFieldIndex < 0) {
      nextRowIndex = clampIndex(currentRowIndex - 1, items.count)
      nextFieldIndex = nextRowIndex === currentRowIndex
        ? 0
        : fields.count - 1
    } else if (rawFieldIndex >= fields.count) {
      nextRowIndex = clampIndex(currentRowIndex + 1, items.count)
      nextFieldIndex = nextRowIndex === currentRowIndex
        ? fields.count - 1
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
