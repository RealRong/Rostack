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
  getRecordFieldValue,
  resolveFieldGroupBucketEntries
} from '@dataview/core/field'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  createOrderIndex,
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

  if (!field) {
    return {
      recordBuckets,
      bucketRecords
    }
  }

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
  const field = getDocumentFieldById(document, fieldId)
  if (!record || !field) {
    return undefined
  }

  return resolveFieldGroupBucketEntries(
    field,
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

export const buildGroupIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): GroupIndex => {
  const base: GroupIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureGroupIndex(base, document, records, fieldIds)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureGroupIndex = (
  previous: GroupIndex,
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = []
): GroupIndex => {
  let changed = false
  const nextFields = new Map(previous.fields)

  fieldIds.forEach(fieldId => {
    if (nextFields.has(fieldId) || !getDocumentFieldById(document, fieldId)) {
      return
    }

    nextFields.set(fieldId, buildFieldGroupIndex(document, records, fieldId))
    changed = true
  })

  return changed
    ? {
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}

export const syncGroupIndex = (
  previous: GroupIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): GroupIndex => {
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
      nextFields.set(fieldId, buildFieldGroupIndex(document, records, fieldId))
      changed = true
      return
    }

    if (!touchedRecords.size || !valueFields.has(fieldId)) {
      return
    }

    const previousField = previous.fields.get(fieldId)
    if (!previousField) {
      return
    }

    const order = createOrderIndex(records.ids)
    const nextRecordBuckets = new Map(previousField.recordBuckets)
    const nextBucketRecords = new Map(previousField.bucketRecords)

    touchedRecords.forEach(recordId => {
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
    changed = true
  })

  return changed
    ? {
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}
