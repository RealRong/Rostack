import type {
  FieldId,
} from '@dataview/core/contracts'
import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'

export interface FieldScope {
  itemIds: readonly ItemId[]
  fieldIds: readonly FieldId[]
}

const stepIndex = (
  ids: readonly string[],
  current: string,
  delta: -1 | 0 | 1
): number | null => {
  const index = ids.findIndex(id => id === current)
  if (index === -1) {
    return null
  }

  const next = index + delta
  return next >= 0 && next < ids.length
    ? next
    : null
}

export const stepField = (input: {
  field: CellRef
  scope: FieldScope
  rowDelta: -1 | 0 | 1
  columnDelta: -1 | 0 | 1
}): CellRef | null => {
  const rowIndex = stepIndex(
    input.scope.itemIds,
    input.field.itemId,
    input.rowDelta
  )
  const columnIndex = stepIndex(
    input.scope.fieldIds,
    input.field.fieldId,
    input.columnDelta
  )
  if (rowIndex === null || columnIndex === null) {
    return null
  }

  const itemId = input.scope.itemIds[rowIndex]
  const fieldId = input.scope.fieldIds[columnIndex]
  if (!itemId || !fieldId) {
    return null
  }

  return {
    itemId,
    fieldId
  }
}
