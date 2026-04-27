export type {
  ValueRef
} from '@dataview/core/types'
import type {
  ValueRef
} from '@dataview/core/types'
import type {
  CellRef
} from '@dataview/engine'

export type CellId = string
export type ValueId = string

const ID_SEPARATOR = '\u0000'

export const valueId = (
  value: ValueRef
): ValueId => `${value.recordId}${ID_SEPARATOR}${value.fieldId}`

export const cellId = (
  cell: CellRef
): CellId => `${cell.itemId}${ID_SEPARATOR}${cell.fieldId}`

export const sameCell = (
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

  return sameCell(left, right)
}
