import type {
  FieldId,
  View,
} from '@dataview/core/types'
import {
  equal,
  order,
} from '@shared/core'

const normalizeFieldIds = (
  fieldIds: readonly FieldId[]
): FieldId[] => Array.from(new Set(fieldIds))

export const readViewFieldIds = (
  view: Pick<View, 'fields'>
): readonly FieldId[] => view.fields

export const cloneViewFields = (
  fieldIds: readonly FieldId[]
): FieldId[] => [...fieldIds]

export const sameViewFields = (
  left: readonly FieldId[],
  right: readonly FieldId[]
): boolean => equal.sameOrder(left, right)

export const replaceViewFields = (
  fieldIds: readonly FieldId[]
): FieldId[] => normalizeFieldIds(fieldIds)

export const normalizeViewFields = (
  fields: unknown
): FieldId[] => replaceViewFields(
  Array.isArray(fields)
    ? fields.filter((fieldId): fieldId is FieldId => typeof fieldId === 'string')
    : []
)

export const moveViewFields = (
  fieldIds: readonly FieldId[],
  movingFieldIds: readonly FieldId[],
  beforeFieldId?: FieldId | null
): FieldId[] => {
  const nextFieldIds = normalizeFieldIds(movingFieldIds)
  if (!nextFieldIds.length) {
    return cloneViewFields(fieldIds)
  }

  return replaceViewFields(order.splice(fieldIds, nextFieldIds, {
    before: beforeFieldId ?? undefined,
  }))
}

export const showViewField = (
  fieldIds: readonly FieldId[],
  fieldId: FieldId,
  beforeFieldId?: FieldId | null
): FieldId[] => replaceViewFields(
  order.moveItem(fieldIds, fieldId, {
    before: beforeFieldId ?? undefined,
  })
)

export const hideViewField = (
  fieldIds: readonly FieldId[],
  fieldId: FieldId
): FieldId[] => replaceViewFields(
  fieldIds.filter((currentFieldId) => currentFieldId !== fieldId)
)

export const clearViewFields = (): FieldId[] => []

export const resolveFieldInsertBeforeFieldId = (
  fieldIds: readonly FieldId[],
  anchorFieldId: FieldId,
  side: 'left' | 'right'
): FieldId | null => {
  const anchorIndex = fieldIds.findIndex((fieldId) => fieldId === anchorFieldId)
  if (anchorIndex === -1) {
    return null
  }

  return side === 'left'
    ? anchorFieldId
    : fieldIds[anchorIndex + 1] ?? null
}
