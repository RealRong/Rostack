import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  getDocumentFieldIds
} from '@dataview/core/document'
import {
  getRecordFieldValue
} from '@dataview/core/field'
import {
  allFieldIdsOf,
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  hasField,
  hasRecordSetChange
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

const collectTouchedFieldIds = (input: {
  previous: SortIndex
  document: DataDoc
  delta: CommitDelta
}): ReadonlySet<FieldId> => {
  if (
    input.delta.entities.fields?.update === 'all'
    || input.delta.entities.values?.fields === 'all'
    || input.delta.entities.records?.update === 'all'
    || hasRecordSetChange(input.delta)
  ) {
    return new Set(allFieldIdsOf(input.document, input.previous.fields))
  }

  return new Set<FieldId>([
    ...collectSchemaFieldIds(input.delta),
    ...collectValueFieldIds(input.delta, { includeTitlePatch: true })
  ])
}

const collectRecordIdsForField = (input: {
  previous: ReadonlyMap<RecordId, SortKey> | undefined
  records: RecordIndex
  delta: CommitDelta
}): ReadonlySet<RecordId> => {
  const touched = collectTouchedRecordIds(input.delta)
  if (touched !== 'all') {
    return touched
  }

  const ids = new Set<RecordId>()
  input.previous?.forEach((_value, recordId) => ids.add(recordId))
  input.records.ids.forEach(recordId => ids.add(recordId))
  return ids
}

export const buildSortIndex = (
  document: DataDoc,
  records: RecordIndex,
  rev = 1
): SortIndex => ({
  fields: new Map(
    getDocumentFieldIds(document).map(fieldId => [
      fieldId,
      buildFieldSortIndex(document, records, fieldId)
    ] as const)
  ),
  rev
})

export const syncSortIndex = (
  previous: SortIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): SortIndex => {
  if (!delta.summary.indexes) {
    return previous
  }

  const schemaFields = collectSchemaFieldIds(delta)
  const touchedFields = collectTouchedFieldIds({
    previous,
    document,
    delta
  })
  if (!touchedFields.size) {
    return previous
  }

  const nextFields = new Map(previous.fields)
  touchedFields.forEach(fieldId => {
    if (!hasField(document, fieldId)) {
      nextFields.delete(fieldId)
      return
    }

    if (schemaFields.has(fieldId) || !previous.fields.has(fieldId)) {
      nextFields.set(fieldId, buildFieldSortIndex(document, records, fieldId))
      return
    }

    const previousField = previous.fields.get(fieldId)
    const recordIds = collectRecordIdsForField({
      previous: previousField,
      records,
      delta
    })

    if (!recordIds.size || !previousField) {
      return
    }

    const nextField = new Map(previousField)
    recordIds.forEach(recordId => {
      const row = records.rows.get(recordId)
      if (!row) {
        nextField.delete(recordId)
        return
      }

      nextField.set(recordId, getRecordFieldValue(row, fieldId))
    })

    nextFields.set(fieldId, nextField)
  })

  return {
    fields: nextFields,
    rev: previous.rev + 1
  }
}
