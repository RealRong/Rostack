import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  getRecordFieldValue
} from '@dataview/core/field'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from './shared'
import type {
  RecordIndex,
  SortIndex,
  SortKey
} from './types'

const buildFieldSortIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): ReadonlyMap<RecordId, SortKey> => new Map(
  records.ids.flatMap(recordId => {
    const row = records.rows.get(recordId)
    return row
      ? [[recordId, getRecordFieldValue(row, fieldId)] as const]
      : []
  })
)

export const buildSortIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): SortIndex => {
  const base: SortIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureSortIndex(base, document, records, fieldIds)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureSortIndex = (
  previous: SortIndex,
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = []
): SortIndex => {
  let changed = false
  const nextFields = new Map(previous.fields)

  fieldIds.forEach(fieldId => {
    if (nextFields.has(fieldId) || !getDocumentFieldById(document, fieldId)) {
      return
    }

    nextFields.set(fieldId, buildFieldSortIndex(document, records, fieldId))
    changed = true
  })

  return changed
    ? {
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}

export const syncSortIndex = (
  previous: SortIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): SortIndex => {
  if (!delta.summary.indexes || !previous.fields.size) {
    return previous
  }

  const loadedFieldIds = new Set(previous.fields.keys())
  const schemaFields = collectSchemaFieldIds(delta)
  const valueFields = collectValueFieldIds(delta, { includeTitlePatch: true })
  const touchedRecords = collectTouchedRecordIds(delta)
  let changed = false
  const nextFields = new Map(previous.fields)

  Array.from(loadedFieldIds).forEach(fieldId => {
    if (schemaFields.has(fieldId) && !getDocumentFieldById(document, fieldId)) {
      nextFields.delete(fieldId)
      changed = true
      return
    }

    if (
      schemaFields.has(fieldId)
      || touchedRecords === 'all'
    ) {
      nextFields.set(fieldId, buildFieldSortIndex(document, records, fieldId))
      changed = true
      return
    }

    if (!touchedRecords.size || !valueFields.has(fieldId)) {
      return
    }

    const previousField = previous.fields.get(fieldId)
    if (!previousField) {
      return
    }

    const nextField = new Map(previousField)
    touchedRecords.forEach(recordId => {
      const row = records.rows.get(recordId)
      if (!row) {
        nextField.delete(recordId)
        return
      }

      nextField.set(recordId, getRecordFieldValue(row, fieldId))
    })

    nextFields.set(fieldId, nextField)
    changed = true
  })

  return changed
    ? {
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}
