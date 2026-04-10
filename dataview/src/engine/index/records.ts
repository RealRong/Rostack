import type {
  CommitDelta,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  RecordIndex
} from './types'

const toValueMap = (
  document: DataDoc,
  fieldId: FieldId
): ReadonlyMap<RecordId, unknown> => {
  const entries = document.records.order.map(recordId => {
    const row = document.records.byId[recordId]
    return [
      recordId,
      fieldId === TITLE_FIELD_ID
        ? row?.title
        : row?.values[fieldId]
    ] as const
  })

  return new Map(
    entries.filter((entry): entry is readonly [RecordId, unknown] => entry[1] !== undefined)
  )
}

const collectUpdatedRecordIds = (
  delta: CommitDelta
) => {
  const ids = new Set<RecordId>()

  const updated = delta.entities.records?.update
  if (updated === 'all') {
    return 'all' as const
  }
  if (Array.isArray(updated)) {
    updated.forEach(id => ids.add(id))
  }
  const valueRecords = delta.entities.values?.records
  if (Array.isArray(valueRecords)) {
    valueRecords.forEach(id => ids.add(id))
  }

  for (const item of delta.semantics) {
    if (item.kind === 'record.patch') {
      item.ids.forEach(id => ids.add(id))
    }
    if (item.kind === 'record.values' && Array.isArray(item.records)) {
      item.records.forEach(id => ids.add(id))
    }
  }

  return ids
}

export const buildRecordIndex = (
  document: DataDoc,
  rev = 1
): RecordIndex => {
  const rows = new Map(
    document.records.order.flatMap(recordId => {
      const row = document.records.byId[recordId]
      return row
        ? [[recordId, row] as const]
        : []
    })
  )

  const values = new Map<FieldId, ReadonlyMap<RecordId, unknown>>()
  values.set(TITLE_FIELD_ID, toValueMap(document, TITLE_FIELD_ID))
  document.fields.order.forEach(fieldId => {
    values.set(fieldId, toValueMap(document, fieldId))
  })

  return {
    ids: [...document.records.order],
    rows,
    values,
    rev
  }
}

export const syncRecordIndex = (
  previous: RecordIndex,
  document: DataDoc,
  delta: CommitDelta
): RecordIndex => {
  if (!delta.summary.indexes) {
    return previous
  }

  if (
    delta.entities.records?.update === 'all'
    || delta.entities.fields?.update === 'all'
    || delta.entities.values?.records === 'all'
    || delta.entities.values?.fields === 'all'
  ) {
    return buildRecordIndex(document, previous.rev + 1)
  }

  const nextRows = new Map(previous.rows)
  const nextValues = new Map(previous.values)
  let changed = false

  const updatedRecordIds = collectUpdatedRecordIds(delta)
  if (updatedRecordIds === 'all') {
    return buildRecordIndex(document, previous.rev + 1)
  }

  delta.entities.records?.remove?.forEach(recordId => {
    if (!nextRows.has(recordId)) {
      return
    }

    nextRows.delete(recordId)
    Array.from(nextValues.entries()).forEach(([fieldId, valueMap]) => {
      if (valueMap.has(recordId)) {
        const nextValueMap = new Map(valueMap)
        nextValueMap.delete(recordId)
        changed = true
        nextValues.set(fieldId, nextValueMap)
      }
    })
    changed = true
  })

  const touchedFields = new Set<FieldId>()
  delta.entities.fields?.add?.forEach(fieldId => touchedFields.add(fieldId))
  if (Array.isArray(delta.entities.fields?.update)) {
    delta.entities.fields.update.forEach(fieldId => touchedFields.add(fieldId))
  }
  if (Array.isArray(delta.entities.values?.fields)) {
    delta.entities.values.fields.forEach(fieldId => touchedFields.add(fieldId))
  }

  for (const item of delta.semantics) {
    if (item.kind === 'record.patch' && item.aspects.includes('title')) {
      touchedFields.add(TITLE_FIELD_ID)
    }
  }

  document.records.order.forEach(recordId => {
    if (!updatedRecordIds.has(recordId) && !delta.entities.records?.add?.includes(recordId)) {
      return
    }

    const row = document.records.byId[recordId]
    if (!row) {
      return
    }

    nextRows.set(recordId, row)
    changed = true
  })

  if (delta.entities.records?.add?.length || delta.entities.records?.remove?.length) {
    touchedFields.add(TITLE_FIELD_ID)
    document.fields.order.forEach(fieldId => touchedFields.add(fieldId))
  }

  touchedFields.forEach(fieldId => {
    if (!document.fields.byId[fieldId as keyof typeof document.fields.byId] && fieldId !== TITLE_FIELD_ID) {
      if (nextValues.delete(fieldId)) {
        changed = true
      }
      return
    }

    nextValues.set(fieldId, toValueMap(document, fieldId))
    changed = true
  })

  if (!changed && previous.ids === document.records.order) {
    return previous
  }

  return {
    ids: [...document.records.order],
    rows: nextRows,
    values: nextValues,
    rev: previous.rev + 1
  }
}
