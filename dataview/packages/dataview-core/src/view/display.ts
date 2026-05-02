import type {
  FieldId,
  ViewDisplay
} from '@dataview/core/types'
import {
  entityTable,
  equal,
  order
} from '@shared/core'

const toDisplayEntries = (
  fieldIds: readonly FieldId[]
) => entityTable.normalize.list(
  Array.from(new Set(fieldIds)).map((fieldId) => ({
    id: fieldId
  }))
)

export const readViewDisplayFieldIds = (
  display: ViewDisplay
): readonly FieldId[] => entityTable.read.ids(display.fields)

export const cloneViewDisplay = (
  display: ViewDisplay
): ViewDisplay => ({
  fields: entityTable.clone.table(display.fields)
})

export const sameViewDisplay = (
  left: ViewDisplay,
  right: ViewDisplay
): boolean => equal.sameOrder(
  readViewDisplayFieldIds(left),
  readViewDisplayFieldIds(right)
)

export const replaceViewDisplayFields = (
  fieldIds: readonly FieldId[]
): ViewDisplay => ({
  fields: toDisplayEntries(fieldIds)
})

export const normalizeViewDisplay = (
  display: unknown
): ViewDisplay => {
  const source = typeof display === 'object' && display !== null
    ? display as {
        fields?: unknown
      }
    : undefined

  if (source?.fields && typeof source.fields === 'object' && !Array.isArray(source.fields)) {
    const table = source.fields as {
      ids?: unknown
      byId?: unknown
    }

    if (Array.isArray(table.ids) && typeof table.byId === 'object' && table.byId !== null) {
      return {
        fields: entityTable.normalize.table(table as ViewDisplay['fields'])
      }
    }
  }

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
  const nextFieldIds = Array.from(new Set(fieldIds))
  if (!nextFieldIds.length) {
    return cloneViewDisplay(display)
  }

  return replaceViewDisplayFields(
    order.splice(readViewDisplayFieldIds(display), nextFieldIds, {
      before: beforeFieldId ?? undefined
    })
  )
}

export const showViewDisplayField = (
  display: ViewDisplay,
  fieldId: FieldId,
  beforeFieldId?: FieldId | null
): ViewDisplay => replaceViewDisplayFields(
  order.moveItem(readViewDisplayFieldIds(display), fieldId, {
    before: beforeFieldId ?? undefined
  })
)

export const hideViewDisplayField = (
  display: ViewDisplay,
  fieldId: FieldId
): ViewDisplay => replaceViewDisplayFields(
  readViewDisplayFieldIds(display).filter(currentFieldId => currentFieldId !== fieldId)
)

export const clearViewDisplayFields = (): ViewDisplay => ({
  fields: toDisplayEntries([])
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
