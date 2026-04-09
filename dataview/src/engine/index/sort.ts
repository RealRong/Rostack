import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentFieldIds
} from '@dataview/core/document'
import {
  getRecordFieldValue
} from '@dataview/core/field'
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

const collectTouchedFieldIds = (
  delta: CommitDelta
) => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
    || delta.entities.records?.update === 'all'
    || delta.entities.records?.add?.length
    || delta.entities.records?.remove?.length
  ) {
    return 'all' as const
  }

  const fields = new Set<FieldId>()
  delta.entities.fields?.add?.forEach(fieldId => fields.add(fieldId))
  if (Array.isArray(delta.entities.fields?.update)) {
    delta.entities.fields.update.forEach(fieldId => fields.add(fieldId))
  }
  delta.entities.fields?.remove?.forEach(fieldId => fields.add(fieldId))
  if (Array.isArray(delta.entities.values?.fields)) {
    delta.entities.values.fields.forEach(fieldId => fields.add(fieldId))
  }

  for (const item of delta.semantics) {
    if (item.kind === 'record.patch' && item.aspects.includes('title')) {
      fields.add('title')
    }
  }

  return fields
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

  const touched = collectTouchedFieldIds(delta)
  if (touched === 'all') {
    return buildSortIndex(document, records, previous.rev + 1)
  }

  if (!touched.size) {
    return previous
  }

  const nextFields = new Map(previous.fields)
  touched.forEach(fieldId => {
    if (!getDocumentFieldById(document, fieldId)) {
      nextFields.delete(fieldId)
      return
    }

    nextFields.set(fieldId, buildFieldSortIndex(document, records, fieldId))
  })

  return {
    fields: nextFields,
    rev: previous.rev + 1
  }
}
