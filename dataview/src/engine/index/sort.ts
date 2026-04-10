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
  compareFieldValues
} from '@dataview/core/field'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from './shared'
import type {
  RecordIndex,
  SortFieldIndex,
  SortIndex
} from './types'

const compareSortValues = (
  field: ReturnType<typeof getDocumentFieldById>,
  left: unknown,
  right: unknown
): number => {
  if (field?.kind === 'number' && typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return compareFieldValues(field, left, right)
}

const buildFieldSortIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): SortFieldIndex => {
  const field = getDocumentFieldById(document, fieldId)
  const values = records.values.get(fieldId) ?? new Map<RecordId, unknown>()
  const asc = records.ids.slice().sort((leftId, rightId) => {
    const result = compareSortValues(
      field,
      values.get(leftId),
      values.get(rightId)
    )

    if (result !== 0) {
      return result
    }

    return (records.order.get(leftId) ?? Number.MAX_SAFE_INTEGER)
      - (records.order.get(rightId) ?? Number.MAX_SAFE_INTEGER)
  })

  return {
    asc,
    desc: asc.slice().reverse()
  }
}

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
