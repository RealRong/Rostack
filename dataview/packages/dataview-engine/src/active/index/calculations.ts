import type {
  CalculationDemand,
  CalculationEntry
} from '@dataview/core/calculation'
import {
  calculation
} from '@dataview/core/calculation'
import {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
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
  applyEntryTransition,
  ensureCalculationFieldTransition
} from '@dataview/engine/active/shared/impact'
import {
  ensureFieldIndexes,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'

const EMPTY_ENTRIES = new Map<RecordId, CalculationEntry>()

const buildFieldEntries = (input: {
  context: IndexReadContext
  records: RecordIndex
  demand: CalculationDemand
}): ReadonlyMap<RecordId, CalculationEntry> => {
  const field = input.context.reader.fields.get(input.demand.fieldId)
  if (!field) {
    return EMPTY_ENTRIES
  }

  const values = input.records.values.get(input.demand.fieldId)?.byRecord
  const entries = new Map<RecordId, CalculationEntry>()
  input.records.ids.forEach(recordId => {
    entries.set(recordId, calculation.entry.create({
      field,
      value: values?.get(recordId),
      capabilities: input.demand.capabilities
    }))
  })

  return entries
}

const buildFieldCalcIndex = (input: {
  context: IndexReadContext
  records: RecordIndex
  demand: CalculationDemand
}): FieldCalcIndex => {
  const entries = buildFieldEntries(input)

  return {
    fieldId: input.demand.fieldId,
    capabilities: input.demand.capabilities,
    entries,
    global: calculation.state.build({
      entries,
      capabilities: input.demand.capabilities
    })
  }
}

export const buildCalculationIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  demands: readonly CalculationDemand[] = [],
  rev = 1
): CalculationIndex => {
  const base: CalculationIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureCalculationIndex(base, context, records, demands)

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
  demands: readonly CalculationDemand[] = []
): CalculationIndex => {
  const demandByField = new Map<FieldId, CalculationDemand>()
  demands.forEach(demand => {
    demandByField.set(demand.fieldId, demand)
  })

  const fields = createMapPatchBuilder(previous.fields)
  previous.fields.forEach((previousField, fieldId) => {
    const demand = demandByField.get(fieldId)
    if (!demand) {
      fields.delete(fieldId)
      return
    }

    if (!calculation.capability.same(previousField.capabilities, demand.capabilities)) {
      fields.set(fieldId, buildFieldCalcIndex({
        context,
        records,
        demand
      }))
    }
  })

  const ensured = ensureFieldIndexes({
    previous: fields.finish(),
    hasField: fieldId => context.fieldIdSet.has(fieldId),
    fieldIds: [...demandByField.keys()],
    build: fieldId => buildFieldCalcIndex({
      context,
      records,
      demand: demandByField.get(fieldId)!
    })
  })

  return ensured.changed || fields.changed()
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
      ensureCalculationFieldTransition(impact, fieldId).rebuild = true
      fields.set(fieldId, buildFieldCalcIndex({
        context,
        records,
        demand: {
          fieldId,
          capabilities: previousField.capabilities
        }
      }))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const field = context.reader.fields.get(fieldId)
    if (!field) {
      return
    }

    const values = records.values.get(fieldId)?.byRecord
    const entries = createMapPatchBuilder(previousField.entries)
    const reducer = calculation.state.builder({
      previous: previousField.global,
      capabilities: previousField.capabilities
    })

    context.touchedRecords.forEach(recordId => {
      const previousEntry = previousField.entries.get(recordId)
      const nextEntry = records.order.has(recordId)
        ? calculation.entry.create({
            field,
            value: values?.get(recordId),
            capabilities: previousField.capabilities
          })
        : undefined

      if (calculation.entry.same(previousEntry, nextEntry)) {
        return
      }

      applyEntryTransition(
        ensureCalculationFieldTransition(impact, fieldId),
        recordId,
        previousEntry,
        nextEntry,
        calculation.entry.same
      )
      reducer.apply(previousEntry, nextEntry)

      if (nextEntry) {
        entries.set(recordId, nextEntry)
        return
      }

      entries.delete(recordId)
    })

    if (!entries.changed()) {
      return
    }

    const nextEntries = entries.finish()
    fields.set(fieldId, {
      fieldId,
      capabilities: previousField.capabilities,
      entries: nextEntries,
      global: reducer.finish()
    })
  })

  return fields.changed()
    ? {
        fields: fields.finish(),
        rev: previous.rev + 1
      }
    : previous
}
