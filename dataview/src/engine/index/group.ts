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
  getRecordFieldValue,
  resolveFieldGroupBucketEntries
} from '@dataview/core/field'
import {
  allFieldIdsOf,
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  createOrderIndex,
  hasField,
  hasRecordSetChange,
  insertOrderedId,
  removeOrderedId
} from './shared'
import type {
  BucketKey,
  GroupFieldIndex,
  GroupIndex,
  RecordIndex,
  SortedIdSet
} from './types'

const buildFieldGroupIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): GroupFieldIndex => {
  const field = getDocumentFieldById(document, fieldId)
  const recordBuckets = new Map<RecordId, readonly BucketKey[]>()
  const bucketRecords = new Map<BucketKey, RecordId[]>()

  records.ids.forEach(recordId => {
    const record = records.rows.get(recordId)
    if (!record) {
      return
    }

    const buckets = resolveFieldGroupBucketEntries(
      field,
      getRecordFieldValue(record, fieldId)
    ).map(bucket => String(bucket.key))

    recordBuckets.set(recordId, buckets)
    buckets.forEach(bucketKey => {
      const ids = bucketRecords.get(bucketKey) ?? []
      if (!bucketRecords.has(bucketKey)) {
        bucketRecords.set(bucketKey, ids)
      }
      ids.push(recordId)
    })
  })

  return {
    recordBuckets,
    bucketRecords
  }
}

const resolveRecordBuckets = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId,
  recordId: RecordId
): readonly BucketKey[] | undefined => {
  const record = records.rows.get(recordId)
  if (!record) {
    return undefined
  }

  return resolveFieldGroupBucketEntries(
    getDocumentFieldById(document, fieldId),
    getRecordFieldValue(record, fieldId)
  ).map(bucket => String(bucket.key))
}

const removeBucketMemberships = (
  bucketRecords: Map<BucketKey, SortedIdSet<RecordId>>,
  bucketKeys: readonly BucketKey[],
  recordId: RecordId
) => {
  bucketKeys.forEach(bucketKey => {
    const ids = bucketRecords.get(bucketKey)
    if (!ids) {
      return
    }

    const nextIds = removeOrderedId(ids, recordId)
    if (nextIds.length) {
      bucketRecords.set(bucketKey, nextIds)
      return
    }

    bucketRecords.delete(bucketKey)
  })
}

const addBucketMemberships = (
  bucketRecords: Map<BucketKey, SortedIdSet<RecordId>>,
  bucketKeys: readonly BucketKey[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
) => {
  bucketKeys.forEach(bucketKey => {
    bucketRecords.set(
      bucketKey,
      insertOrderedId(bucketRecords.get(bucketKey) ?? [], recordId, order)
    )
  })
}

const collectTouchedFieldIds = (input: {
  previous: GroupIndex
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
  previous: GroupFieldIndex | undefined
  records: RecordIndex
  delta: CommitDelta
}): ReadonlySet<RecordId> => {
  const touched = collectTouchedRecordIds(input.delta)
  if (touched !== 'all') {
    return touched
  }

  const ids = new Set<RecordId>()
  input.previous?.recordBuckets.forEach((_bucketKeys, recordId) => ids.add(recordId))
  input.records.ids.forEach(recordId => ids.add(recordId))
  return ids
}

export const buildGroupIndex = (
  document: DataDoc,
  records: RecordIndex,
  rev = 1
): GroupIndex => {
  const fields = new Map(
    getDocumentFieldIds(document).map(fieldId => [
      fieldId,
      buildFieldGroupIndex(document, records, fieldId)
    ] as const)
  )

  return {
    fields,
    rev
  }
}

export const syncGroupIndex = (
  previous: GroupIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): GroupIndex => {
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

  const order = createOrderIndex(records.ids)
  const nextFields = new Map(previous.fields)

  touchedFields.forEach(fieldId => {
    if (!hasField(document, fieldId)) {
      nextFields.delete(fieldId)
      return
    }

    if (schemaFields.has(fieldId) || !previous.fields.has(fieldId)) {
      nextFields.set(fieldId, buildFieldGroupIndex(document, records, fieldId))
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

    const nextRecordBuckets = new Map(previousField.recordBuckets)
    const nextBucketRecords = new Map(previousField.bucketRecords)

    recordIds.forEach(recordId => {
      const previousBuckets = nextRecordBuckets.get(recordId) ?? []
      if (previousBuckets.length) {
        removeBucketMemberships(nextBucketRecords, previousBuckets, recordId)
        nextRecordBuckets.delete(recordId)
      }

      const nextBuckets = resolveRecordBuckets(document, records, fieldId, recordId)
      if (!nextBuckets?.length) {
        return
      }

      nextRecordBuckets.set(recordId, nextBuckets)
      addBucketMemberships(nextBucketRecords, nextBuckets, recordId, order)
    })

    nextFields.set(fieldId, {
      recordBuckets: nextRecordBuckets,
      bucketRecords: nextBucketRecords
    })
  })

  return {
    fields: nextFields,
    rev: previous.rev + 1
  }
}
