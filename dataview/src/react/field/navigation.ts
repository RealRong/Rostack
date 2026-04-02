import type {
  PropertyId,
} from '@dataview/core/contracts'
import type {
  PropertyEditIntent
} from '@dataview/react/interaction'
import type {
  AppearanceId,
  AppearanceList,
  FieldId,
  ViewFieldRef
} from '@dataview/engine/projection/view'
import {
  fieldId,
  fieldOf
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

export const stepFieldByIntent = (input: {
  field: FieldId
  scope: FieldScope
  intent: PropertyEditIntent
}): FieldId | null => {
  switch (input.intent) {
    case 'next-field':
      return stepField({
        field: input.field,
        scope: input.scope,
        rowDelta: 0,
        columnDelta: 1
      })
    case 'previous-field':
      return stepField({
        field: input.field,
        scope: input.scope,
        rowDelta: 0,
        columnDelta: -1
      })
    case 'next-item':
      return stepField({
        field: input.field,
        scope: input.scope,
        rowDelta: 1,
        columnDelta: 0
      })
    default:
      return null
  }
}

export const stepViewFieldByIntent = (input: {
  field: ViewFieldRef
  scope: FieldScope
  appearances?: Pick<AppearanceList, 'get'>
  intent: PropertyEditIntent
}): ViewFieldRef | null => {
  const next = stepFieldByIntent({
    field: fieldId(input.field),
    scope: input.scope,
    intent: input.intent
  })

  return next
    ? fieldOf({
        viewId: input.field.viewId,
        field: next,
        appearances: input.appearances
      })
    : null
}
