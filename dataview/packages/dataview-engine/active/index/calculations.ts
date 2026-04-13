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
  ensureFieldIndexes,
  createFieldSyncContext,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from './sync'
import type {
  AggregateEntry,
  CalculationIndex,
  FieldCalcIndex,
  RecordIndex
} from './contracts'

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
    entries,
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
  const ensured = ensureFieldIndexes({
    previous: previous.fields,
    document,
    fieldIds,
    build: fieldId => buildFieldCalcIndex(document, records, fieldId)
  })

  return ensured.changed
    ? {
        fields: ensured.fields,
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
  const context = createFieldSyncContext(delta, {
    includeTitlePatch: true
  })
  let changed = false
  const nextFields = new Map(previous.fields)

  Array.from(loadedFieldIds).forEach(fieldId => {
    if (shouldDropFieldIndex(document, context, fieldId)) {
      nextFields.delete(fieldId)
      changed = true
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      nextFields.set(fieldId, buildFieldCalcIndex(document, records, fieldId))
      changed = true
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const previousField = previous.fields.get(fieldId)
    const field = getDocumentFieldById(document, fieldId)
    if (!previousField || !field) {
      return
    }

    const nextEntries = new Map(previousField.entries)
    let nextGlobal = previousField.global

    context.touchedRecords.forEach(recordId => {
      const previousEntry = nextEntries.get(recordId)
      const row = records.rows.get(recordId)
      if (!row) {
        nextEntries.delete(recordId)
        nextGlobal = patchAggregateState({
          state: nextGlobal,
          previous: previousEntry,
          entries: nextEntries
        })
        return
      }

      const nextEntry = createAggregateEntry(field, getRecordFieldValue(row, fieldId))
      nextEntries.set(recordId, nextEntry)
      nextGlobal = patchAggregateState({
        state: nextGlobal,
        previous: previousEntry,
        next: nextEntry,
        entries: nextEntries
      })
    })

    nextFields.set(fieldId, {
      entries: nextEntries,
      global: nextGlobal
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
