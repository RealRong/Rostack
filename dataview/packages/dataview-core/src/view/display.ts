import type {
  FieldId,
  ViewDisplay
} from '@dataview/core/types'
import {
  collection,
  equal,
  order
} from '@shared/core'

export const cloneViewDisplay = (
  display: ViewDisplay
): ViewDisplay => ({
  fields: [...display.fields]
})

export const sameViewDisplay = (
  left: ViewDisplay,
  right: ViewDisplay
): boolean => equal.sameOrder(left.fields, right.fields)

export const replaceViewDisplayFields = (
  fieldIds: readonly FieldId[]
): ViewDisplay => ({
  fields: collection.unique(fieldIds)
})

export const normalizeViewDisplay = (
  display: unknown
): ViewDisplay => {
  const source = typeof display === 'object' && display !== null
    ? display as {
        fields?: unknown
      }
    : undefined

  return replaceViewDisplayFields(
    Array.isArray(source?.fields)
      ? source.fields.filter((fieldId): fieldId is FieldId => typeof fieldId === 'string')
      : []
  )
}

export const moveViewDisplayFields = (
  display: ViewDisplay,
  fieldIds: readonly FieldId[],
  beforeFieldId?: FieldId | null
): ViewDisplay => {
  const nextFieldIds = collection.unique(fieldIds)
  if (!nextFieldIds.length) {
    return cloneViewDisplay(display)
  }

  return {
    fields: order.splice(display.fields, nextFieldIds, {
      before: beforeFieldId ?? undefined
    })
  }
}

export const showViewDisplayField = (
  display: ViewDisplay,
  fieldId: FieldId,
  beforeFieldId?: FieldId | null
): ViewDisplay => ({
  fields: order.moveItem(display.fields, fieldId, {
    before: beforeFieldId ?? undefined
  })
})

export const hideViewDisplayField = (
  display: ViewDisplay,
  fieldId: FieldId
): ViewDisplay => ({
  fields: display.fields.filter(currentFieldId => currentFieldId !== fieldId)
})

export const clearViewDisplayFields = (): ViewDisplay => ({
  fields: []
})

export const resolveDisplayInsertBeforeFieldId = (
  fieldIds: readonly FieldId[],
  anchorFieldId: FieldId,
  side: 'left' | 'right'
): FieldId | null => {
  const anchorIndex = fieldIds.findIndex(fieldId => fieldId === anchorFieldId)
  if (anchorIndex === -1) {
    return null
  }

  return side === 'left'
    ? anchorFieldId
    : fieldIds[anchorIndex + 1] ?? null
}
