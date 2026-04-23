import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  CellRef,
  ItemId
} from '@dataview/engine'

export interface RecordValueRef {
  recordId: RecordId
  fieldId: FieldId
}

export const CELL_KEY_SEPARATOR = '\u0000'

export const recordValueRef = (
  recordId: RecordId,
  fieldId: FieldId
): RecordValueRef => ({
  recordId,
  fieldId
})

export const recordValueKey = (
  ref: RecordValueRef
) => `${ref.recordId}${CELL_KEY_SEPARATOR}${ref.fieldId}`

export const tableCell = (
  itemId: ItemId,
  fieldId: FieldId
): CellRef => ({
  itemId,
  fieldId
})

export const tableCellKey = (
  cell: CellRef
) => `${cell.itemId}${CELL_KEY_SEPARATOR}${cell.fieldId}`

export const sameCellRef = (
  left: CellRef,
  right: CellRef
) => left.itemId === right.itemId
  && left.fieldId === right.fieldId

export const sameOptionalCell = (
  left: CellRef | undefined,
  right: CellRef | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return sameCellRef(left, right)
}
