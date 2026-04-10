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
  buildAggregateState,
  createAggregateEntry,
  patchAggregateState
} from './aggregate'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from './shared'
import type {
  AggregateEntry,
  CalculationIndex,
  FieldCalcIndex,
  RecordIndex
} from './types'

const buildFieldEntries = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): ReadonlyMap<RecordId, AggregateEntry> => {
  const field = getDocumentFieldById(document, fieldId)
  if (!field) {
    return new Map()
  }

  return new Map(
    records.ids.flatMap(recordId => {
      const row = records.rows.get(recordId)
      return row
        ? [[
            recordId,
            createAggregateEntry(field, getRecordFieldValue(row, fieldId))
          ] as const]
        : []
    })
  )
}

const buildFieldCalcIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): FieldCalcIndex => {
  const entries = buildFieldEntries(document, records, fieldId)

  return {
    global: buildAggregateState(entries)
  }
}

export const buildCalculationIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): CalculationIndex => {
  const base: CalculationIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureCalculationIndex(base, document, records, fieldIds)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureCalculationIndex = (
  previous: CalculationIndex,
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = []
): CalculationIndex => {
  let changed = false
  const nextFields = new Map(previous.fields)

  fieldIds.forEach(fieldId => {
    if (nextFields.has(fieldId) || !getDocumentFieldById(document, fieldId)) {
      return
    }

    nextFields.set(fieldId, buildFieldCalcIndex(document, records, fieldId))
    changed = true
  })

  return changed
    ? {
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}

export const syncCalculationIndex = (
  previous: CalculationIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): CalculationIndex => {
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
      nextFields.set(fieldId, buildFieldCalcIndex(document, records, fieldId))
      changed = true
      return
    }

    if (!touchedRecords.size || !valueFields.has(fieldId)) {
      return
    }

    const previousField = previous.fields.get(fieldId)
    const field = getDocumentFieldById(document, fieldId)
    if (!previousField || !field) {
      return
    }

    const nextEntries = new Map(previousField.global.entries)
    let nextGlobal = previousField.global

    touchedRecords.forEach(recordId => {
      const previousEntry = nextEntries.get(recordId)
      const row = records.rows.get(recordId)
      if (!row) {
        nextEntries.delete(recordId)
        nextGlobal = patchAggregateState({
          state: nextGlobal,
          recordId,
          previous: previousEntry
        })
        return
      }

      const nextEntry = createAggregateEntry(field, getRecordFieldValue(row, fieldId))
      nextEntries.set(recordId, nextEntry)
      nextGlobal = patchAggregateState({
        state: nextGlobal,
        recordId,
        previous: previousEntry,
        next: nextEntry
      })
    })

    nextFields.set(fieldId, {
      global: nextGlobal.entries === nextEntries
        ? nextGlobal
        : {
            ...nextGlobal,
            entries: nextEntries
          }
    })
    changed = true
  })

  return changed
    ? {
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}
