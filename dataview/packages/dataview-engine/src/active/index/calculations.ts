import {
  getRecordFieldValue
} from '@dataview/core/field'
import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import { createMapPatchBuilder } from '@dataview/engine/active/shared/patch'
import {
  buildAggregateState,
  createAggregateBuilder,
  createAggregateEntry,
  sameAggregateEntry
} from '@dataview/engine/active/index/aggregate'
import type {
  AggregateEntry,
  CalculationIndex,
  FieldCalcIndex,
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex
} from '@dataview/engine/active/index/contracts'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import {
  applyEntryChange,
  ensureCalculationFieldChange
} from '@dataview/engine/active/shared/impact'
import {
  ensureFieldIndexes,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'

const buildFieldEntries = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldId: FieldId
): ReadonlyMap<RecordId, AggregateEntry> => {
  const field = context.reader.fields.get(fieldId)
  if (!field) {
    return new Map<RecordId, AggregateEntry>()
  }

  const entries = new Map<RecordId, AggregateEntry>()
  records.ids.forEach(recordId => {
    const row = records.byId[recordId]
    if (!row) {
      return
    }

    entries.set(
      recordId,
      createAggregateEntry(field, getRecordFieldValue(row, fieldId))
    )
  })

  return entries
}

const buildFieldCalcIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldId: FieldId
): FieldCalcIndex => {
  const entries = buildFieldEntries(context, records, fieldId)

  return {
    entries,
    global: buildAggregateState(entries)
  }
}

export const buildCalculationIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): CalculationIndex => {
  const base: CalculationIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureCalculationIndex(base, context, records, fieldIds)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureCalculationIndex = (
  previous: CalculationIndex,
  context: IndexReadContext,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = []
): CalculationIndex => {
  const ensured = ensureFieldIndexes({
    previous: previous.fields,
    hasField: fieldId => context.fieldIdSet.has(fieldId),
    fieldIds,
    build: fieldId => buildFieldCalcIndex(context, records, fieldId)
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
  context: IndexDeriveContext,
  records: RecordIndex,
  impact: ActiveImpact
): CalculationIndex => {
  if (!context.changed || !previous.fields.size) {
    return previous
  }

  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((previousField, fieldId) => {
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      fields.delete(fieldId)
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      ensureCalculationFieldChange(impact, fieldId).rebuild = true
      fields.set(fieldId, buildFieldCalcIndex(context, records, fieldId))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const field = context.reader.fields.get(fieldId)
    if (!field) {
      return
    }

    const entries = createMapPatchBuilder(previousField.entries)
    const aggregate = createAggregateBuilder(previousField.global)

    context.touchedRecords.forEach(recordId => {
      const previousEntry = previousField.entries.get(recordId)
      const row = records.byId[recordId]
      const nextEntry = row
        ? createAggregateEntry(field, getRecordFieldValue(row, fieldId))
        : undefined

      if (sameAggregateEntry(previousEntry, nextEntry)) {
        return
      }

      applyEntryChange(
        ensureCalculationFieldChange(impact, fieldId),
        recordId,
        previousEntry,
        nextEntry,
        sameAggregateEntry
      )
      if (nextEntry) {
        entries.set(recordId, nextEntry)
      } else {
        entries.delete(recordId)
      }
      aggregate.apply(previousEntry, nextEntry)
    })

    if (!entries.changed()) {
      return
    }

    const nextEntries = entries.finish()
    fields.set(fieldId, {
      entries: nextEntries,
      global: aggregate.finish(nextEntries)
    })
  })

  return fields.changed()
    ? {
        fields: fields.finish(),
        rev: previous.rev + 1
      }
    : previous
}
