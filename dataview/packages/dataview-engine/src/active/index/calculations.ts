import type {
  CalculationDemand,
  CalculationEntry
} from '@dataview/core/view'
import {
  calculation
} from '@dataview/core/view'
import {
  FieldId,
  RecordId
} from '@dataview/core/types'
import {
  createMapDraft as createMapPatchBuilder
} from '@shared/draft'
import type {
  CalculationIndex,
  FieldCalcIndex,
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex
} from '@dataview/engine/active/index/contracts'
import type {
  CalculationTransition
} from '@dataview/engine/active/shared/transition'
import {
  applyEntryTransition,
  ensureCalculationFieldTransition
} from '@dataview/engine/active/shared/transition'
import {
  ensureFieldIndexes,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'

const EMPTY_ENTRIES = new Map<RecordId, CalculationEntry>()
const EMPTY_ENTRY_LIST = [] as readonly CalculationEntry[]
const EMPTY_TOUCHED_RECORDS = new Set<RecordId>()

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

const buildFieldEntryList = (input: {
  entries: ReadonlyMap<RecordId, CalculationEntry>
  recordIds: readonly RecordId[]
}): readonly CalculationEntry[] => {
  if (!input.recordIds.length) {
    return EMPTY_ENTRY_LIST
  }

  const entriesByIndex: CalculationEntry[] = new Array(input.recordIds.length)
  for (let index = 0; index < input.recordIds.length; index += 1) {
    entriesByIndex[index] = input.entries.get(input.recordIds[index]!)!
  }

  return entriesByIndex
}

const syncFieldEntryList = (input: {
  previous: readonly CalculationEntry[]
  nextEntries: ReadonlyMap<RecordId, CalculationEntry>
  previousRecords: RecordIndex
  records: RecordIndex
  touchedRecords: ReadonlySet<RecordId>
}): readonly CalculationEntry[] => {
  if (input.previousRecords.ids !== input.records.ids) {
    return buildFieldEntryList({
      entries: input.nextEntries,
      recordIds: input.records.ids
    })
  }

  let next = input.previous as CalculationEntry[] | undefined
  input.touchedRecords.forEach(recordId => {
    const recordIndex = input.records.order.get(recordId)
    if (recordIndex === undefined) {
      return
    }

    const nextEntry = input.nextEntries.get(recordId)
    if (!nextEntry || input.previous[recordIndex] === nextEntry) {
      return
    }

    next ??= [...input.previous]
    next[recordIndex] = nextEntry
  })

  return next ?? input.previous
}

const buildFieldCalcIndex = (input: {
  context: IndexReadContext
  records: RecordIndex
  demand: CalculationDemand
}): FieldCalcIndex => {
  const field = input.context.reader.fields.get(input.demand.fieldId)
  if (!field) {
    return {
      fieldId: input.demand.fieldId,
      capabilities: input.demand.capabilities,
      entries: EMPTY_ENTRIES,
      entriesByIndex: EMPTY_ENTRY_LIST,
      global: calculation.state.empty(input.demand.capabilities)
    }
  }

  const entries = buildFieldEntries(input)
  const entriesByIndex = buildFieldEntryList({
    entries,
    recordIds: input.records.ids
  })

  return {
    fieldId: input.demand.fieldId,
    capabilities: input.demand.capabilities,
    entries,
    entriesByIndex,
    global: calculation.state.build({
      entriesByIndex,
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
  previousRecords: RecordIndex,
  context: IndexDeriveContext,
  records: RecordIndex,
  transition: CalculationTransition
): CalculationIndex => {
  if (!context.changed || !previous.fields.size) {
    return previous
  }

  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((previousField, fieldId) => {
    const recordIdsChanged = previousRecords.ids !== records.ids
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      fields.delete(fieldId)
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      ensureCalculationFieldTransition(transition, fieldId).rebuild = true
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

    const shouldSync = shouldSyncFieldIndex(context, fieldId)
    if (!shouldSync && !recordIdsChanged) {
      return
    }

    const field = context.reader.fields.get(fieldId)
    if (!field) {
      return
    }

    let nextEntries = previousField.entries
    let nextGlobal = previousField.global
    if (shouldSync) {
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
          ensureCalculationFieldTransition(transition, fieldId),
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

      if (entries.changed()) {
        nextEntries = entries.finish()
        nextGlobal = reducer.finish()
      }
    }

    const nextEntriesByIndex = syncFieldEntryList({
      previous: previousField.entriesByIndex,
      nextEntries,
      previousRecords,
      records,
      touchedRecords: shouldSync
        ? context.touchedRecords
        : EMPTY_TOUCHED_RECORDS
    })

    if (
      nextEntries === previousField.entries
      && nextEntriesByIndex === previousField.entriesByIndex
      && nextGlobal === previousField.global
    ) {
      return
    }
    fields.set(fieldId, {
      fieldId,
      capabilities: previousField.capabilities,
      entries: nextEntries,
      entriesByIndex: nextEntriesByIndex,
      global: nextGlobal
    })
  })

  return fields.changed()
    ? {
        fields: fields.finish(),
        rev: previous.rev + 1
      }
    : previous
}
