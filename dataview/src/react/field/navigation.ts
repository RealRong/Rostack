import type {
  FieldId,
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  AppearanceList,
  CellRef
} from '@dataview/engine/project'

export interface FieldScope {
  appearanceIds: readonly AppearanceId[]
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
    input.scope.appearanceIds,
    input.field.appearanceId,
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

  const appearanceId = input.scope.appearanceIds[rowIndex]
  const fieldId = input.scope.fieldIds[columnIndex]
  if (!appearanceId || !fieldId) {
    return null
  }

  return {
    appearanceId,
    fieldId
  }
}
