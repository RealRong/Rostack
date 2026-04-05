import type {
  PropertyId,
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  AppearanceList,
  FieldId
} from '@dataview/engine/projection/view'

export interface FieldScope {
  appearanceIds: readonly AppearanceId[]
  propertyIds: readonly PropertyId[]
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
  field: FieldId
  scope: FieldScope
  rowDelta: -1 | 0 | 1
  columnDelta: -1 | 0 | 1
}): FieldId | null => {
  const rowIndex = stepIndex(
    input.scope.appearanceIds,
    input.field.appearanceId,
    input.rowDelta
  )
  const columnIndex = stepIndex(
    input.scope.propertyIds,
    input.field.propertyId,
    input.columnDelta
  )
  if (rowIndex === null || columnIndex === null) {
    return null
  }

  const appearanceId = input.scope.appearanceIds[rowIndex]
  const propertyId = input.scope.propertyIds[columnIndex]
  if (!appearanceId || !propertyId) {
    return null
  }

  return {
    appearanceId,
    propertyId
  }
}
