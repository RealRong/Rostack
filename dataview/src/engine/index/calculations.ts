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
import {
  buildAggregateState,
  createAggregateEntry
} from './aggregate'
import {
  allFieldIdsOf,
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  hasField,
  hasRecordSetChange
} from './shared'
import type {
  AggregateEntry,
  AggregateState,
  BucketKey,
  CalculationIndex,
  FieldCalcIndex,
  GroupFieldIndex,
  GroupIndex,
  RecordIndex
} from './types'

const buildFieldEntries = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): ReadonlyMap<RecordId, AggregateEntry> => {
  const field = getDocumentFieldById(document, fieldId)

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

const buildBucketStates = (
  entries: ReadonlyMap<RecordId, AggregateEntry>,
  groupField: GroupFieldIndex | undefined
): Pick<FieldCalcIndex, 'buckets' | 'recordBuckets'> => {
  if (!groupField) {
    return {}
  }

  const bucketEntries = new Map<BucketKey, Map<RecordId, AggregateEntry>>()
  const recordBuckets = new Map<RecordId, readonly BucketKey[]>()

  groupField.recordBuckets.forEach((bucketKeys, recordId) => {
    const entry = entries.get(recordId)
    if (!entry || !bucketKeys.length) {
      return
    }

    recordBuckets.set(recordId, bucketKeys)
    bucketKeys.forEach(bucketKey => {
      const stateEntries = bucketEntries.get(bucketKey) ?? new Map<RecordId, AggregateEntry>()
      if (!bucketEntries.has(bucketKey)) {
        bucketEntries.set(bucketKey, stateEntries)
      }
      stateEntries.set(recordId, entry)
    })
  })

  if (!bucketEntries.size && !recordBuckets.size) {
    return {}
  }

  return {
    ...(bucketEntries.size
      ? {
          buckets: new Map(
            Array.from(bucketEntries.entries(), ([bucketKey, stateEntries]) => [
              bucketKey,
              buildAggregateState(stateEntries)
            ] as const)
          )
        }
      : {}),
    ...(recordBuckets.size ? { recordBuckets } : {})
  }
}

const buildFieldCalcIndex = (
  document: DataDoc,
  records: RecordIndex,
  group: GroupIndex,
  fieldId: FieldId
): FieldCalcIndex => {
  const entries = buildFieldEntries(document, records, fieldId)

  return {
    global: buildAggregateState(entries),
    ...buildBucketStates(entries, group.fields.get(fieldId))
  }
}

const collectTouchedFieldIds = (input: {
  previous: CalculationIndex
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
  previous: FieldCalcIndex | undefined
  records: RecordIndex
  delta: CommitDelta
}): ReadonlySet<RecordId> => {
  const touched = collectTouchedRecordIds(input.delta)
  if (touched !== 'all') {
    return touched
  }

  const ids = new Set<RecordId>()
  input.previous?.global.entries.forEach((_entry, recordId) => ids.add(recordId))
  input.records.ids.forEach(recordId => ids.add(recordId))
  return ids
}

const buildBucketStateMap = (
  buckets: ReadonlyMap<BucketKey, Map<RecordId, AggregateEntry>>
): ReadonlyMap<BucketKey, AggregateState> => new Map(
  Array.from(buckets.entries(), ([bucketKey, entries]) => [
    bucketKey,
    buildAggregateState(entries)
  ] as const)
)

export const buildCalculationIndex = (
  document: DataDoc,
  records: RecordIndex,
  group: GroupIndex,
  rev = 1
): CalculationIndex => ({
  fields: new Map(
    getDocumentFieldIds(document).map(fieldId => [
      fieldId,
      buildFieldCalcIndex(document, records, group, fieldId)
    ] as const)
  ),
  rev
})

export const syncCalculationIndex = (
  previous: CalculationIndex,
  document: DataDoc,
  records: RecordIndex,
  group: GroupIndex,
  delta: CommitDelta
): CalculationIndex => {
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
      nextFields.set(fieldId, buildFieldCalcIndex(document, records, group, fieldId))
      return
    }

    const previousField = previous.fields.get(fieldId)
    const groupField = group.fields.get(fieldId)
    const recordIds = collectRecordIdsForField({
      previous: previousField,
      records,
      delta
    })

    if (!recordIds.size || !previousField) {
      return
    }

    const field = getDocumentFieldById(document, fieldId)
    const nextEntries = new Map(previousField.global.entries)
    const nextRecordBuckets = new Map(previousField.recordBuckets ?? [])
    const nextBucketEntries = new Map(
      Array.from(previousField.buckets?.entries() ?? [], ([bucketKey, state]) => [
        bucketKey,
        new Map(state.entries)
      ] as const)
    )

    recordIds.forEach(recordId => {
      const previousBuckets = nextRecordBuckets.get(recordId) ?? []
      previousBuckets.forEach(bucketKey => {
        const bucketEntries = nextBucketEntries.get(bucketKey)
        if (!bucketEntries) {
          return
        }

        bucketEntries.delete(recordId)
        if (!bucketEntries.size) {
          nextBucketEntries.delete(bucketKey)
        }
      })
      nextRecordBuckets.delete(recordId)

      const row = records.rows.get(recordId)
      if (!row) {
        nextEntries.delete(recordId)
        return
      }

      const entry = createAggregateEntry(field, getRecordFieldValue(row, fieldId))
      nextEntries.set(recordId, entry)

      const bucketKeys = groupField?.recordBuckets.get(recordId) ?? []
      if (!bucketKeys.length) {
        return
      }

      nextRecordBuckets.set(recordId, bucketKeys)
      bucketKeys.forEach(bucketKey => {
        const bucketEntries = nextBucketEntries.get(bucketKey) ?? new Map<RecordId, AggregateEntry>()
        if (!nextBucketEntries.has(bucketKey)) {
          nextBucketEntries.set(bucketKey, bucketEntries)
        }
        bucketEntries.set(recordId, entry)
      })
    })

    nextFields.set(fieldId, {
      global: buildAggregateState(nextEntries),
      ...(nextBucketEntries.size ? { buckets: buildBucketStateMap(nextBucketEntries) } : {}),
      ...(nextRecordBuckets.size ? { recordBuckets: nextRecordBuckets } : {})
    })
  })

  return {
    fields: nextFields,
    rev: previous.rev + 1
  }
}
