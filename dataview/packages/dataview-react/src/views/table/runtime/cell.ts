import type { FieldId } from '@dataview/core/contracts'
import type { CellRef, ItemId } from '@dataview/engine'

export const TABLE_CELL_KEY_SEPARATOR = '\u0000'

export const tableCellKey = (
  cell: CellRef
) => `${cell.itemId}${TABLE_CELL_KEY_SEPARATOR}${cell.fieldId}`

export const tableCell = (
  itemId: ItemId,
  fieldId: FieldId
): CellRef => ({
  itemId,
  fieldId
})

export const sameOptionalCell = (
  left: CellRef | undefined,
  right: CellRef | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return left.itemId === right.itemId
    && left.fieldId === right.fieldId
}
