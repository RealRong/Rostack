import type {
  CommitImpact,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  sameOrder as sameIds
} from '@shared/core'
import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  RecordIndex
} from '@dataview/engine/active/index/contracts'
import {
  collectTouchedFieldIds,
  collectTouchedRecordIds,
  hasIndexChanges,
  createOrderIndex
} from '@dataview/engine/active/index/shared'

const toValueMap = (
  document: DataDoc,
  fieldId: FieldId
): ReadonlyMap<RecordId, unknown> => new Map(
  document.records.order.flatMap(recordId => {
    const row = document.records.byId[recordId]
    const value = fieldId === TITLE_FIELD_ID
      ? row?.title
      : row?.values[fieldId]

    return value === undefined
      ? []
      : [[recordId, value] as const]
  })
)

const readFieldValue = (
  row: DataDoc['records']['byId'][RecordId] | undefined,
  fieldId: FieldId
): unknown => (
  fieldId === TITLE_FIELD_ID
    ? row?.title
    : row?.values[fieldId]
)

const buildRows = (
  document: DataDoc
): ReadonlyMap<RecordId, DataDoc['records']['byId'][RecordId]> => new Map(
  document.records.order.flatMap(recordId => {
    const row = document.records.byId[recordId]
    return row
      ? [[recordId, row] as const]
      : []
  })
)

export const buildRecordIndex = (
  document: DataDoc,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): RecordIndex => ({
  ids: [...document.records.order],
  fieldIds: [...fieldIds],
  order: createOrderIndex(document.records.order),
  rows: buildRows(document),
  values: new Map(
    fieldIds.map(fieldId => [fieldId, toValueMap(document, fieldId)] as const)
  ),
  rev
})

export const syncRecordIndex = (
  previous: RecordIndex,
  document: DataDoc,
  impact: CommitImpact,
  fieldIds: readonly FieldId[] = previous.fieldIds
): RecordIndex => {
  if (!hasIndexChanges(impact)) {
    return previous
  }

  const nextFieldIds = [...fieldIds]

  if (
    impact.reset
    || impact.records?.touched === 'all'
    || impact.records?.valueChangedFields === 'all'
  ) {
    return buildRecordIndex(document, nextFieldIds, previous.rev + 1)
  }

  const touchedRecordIds = collectTouchedRecordIds(impact)
  if (touchedRecordIds === 'all') {
    return buildRecordIndex(document, nextFieldIds, previous.rev + 1)
  }

  const fieldIdsChanged = !sameIds(previous.fieldIds, nextFieldIds)
  const nextFieldSet = new Set(nextFieldIds)
  const recordSetChanged = Boolean(
    impact.records?.recordSetChanged
  )

  let rows: Map<RecordId, DataDoc['records']['byId'][RecordId]> | undefined
  const ensureRows = () => {
    if (!rows) {
      rows = new Map(previous.rows)
    }

    return rows
  }

  impact.records?.removed?.forEach(recordId => {
    if (!previous.rows.has(recordId)) {
      return
    }

    ensureRows().delete(recordId)
  })

  touchedRecordIds.forEach(recordId => {
    const row = document.records.byId[recordId]
    const previousRow = previous.rows.get(recordId)
    if (row === previousRow) {
      return
    }

    const nextRows = ensureRows()
    if (row) {
      nextRows.set(recordId, row)
      return
    }

    nextRows.delete(recordId)
  })

  const touchedFields = new Set<FieldId>()
  if (recordSetChanged) {
    nextFieldIds.forEach(fieldId => touchedFields.add(fieldId))
  }

  const deltaTouchedFields = collectTouchedFieldIds(impact, {
    includeTitlePatch: true
  })
  if (deltaTouchedFields !== 'all') {
    deltaTouchedFields.forEach(fieldId => {
      if (nextFieldSet.has(fieldId)) {
        touchedFields.add(fieldId)
      }
    })
  }

  const mutableColumns = new Map<FieldId, Map<RecordId, unknown>>()
  const readColumn = (
    fieldId: FieldId
  ): ReadonlyMap<RecordId, unknown> => mutableColumns.get(fieldId)
    ?? previous.values.get(fieldId)
    ?? new Map()
  const ensureColumn = (
    fieldId: FieldId
  ): Map<RecordId, unknown> => {
    const cached = mutableColumns.get(fieldId)
    if (cached) {
      return cached
    }

    const nextColumn = new Map(readColumn(fieldId))
    mutableColumns.set(fieldId, nextColumn)
    return nextColumn
  }

  touchedFields.forEach(fieldId => {
    const column = ensureColumn(fieldId)
    touchedRecordIds.forEach(recordId => {
      const nextValue = readFieldValue(document.records.byId[recordId], fieldId)
      if (nextValue === undefined) {
        column.delete(recordId)
        return
      }

      column.set(recordId, nextValue)
    })
  })

  const orderChanged = !sameIds(previous.ids, document.records.order)
  const rowsChanged = Boolean(rows)
  const valuesChanged = fieldIdsChanged || mutableColumns.size > 0

  if (!rowsChanged && !valuesChanged && !orderChanged) {
    return previous
  }

  const values = new Map<FieldId, ReadonlyMap<RecordId, unknown>>()
  nextFieldIds.forEach(fieldId => {
    const column = mutableColumns.get(fieldId)
    if (column) {
      values.set(fieldId, column)
      return
    }

    const previousColumn = previous.values.get(fieldId)
    if (previousColumn) {
      values.set(fieldId, previousColumn)
      return
    }

    values.set(fieldId, toValueMap(document, fieldId))
  })

  const ids = orderChanged
    ? [...document.records.order]
    : previous.ids

  return {
    ids,
    fieldIds: nextFieldIds,
    order: orderChanged
      ? createOrderIndex(ids)
      : previous.order,
    rows: rows ?? previous.rows,
    values,
    rev: previous.rev + 1
  }
}
