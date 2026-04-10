import type {
  CommitDelta,
  DataDoc,
  FieldId,
  Field,
  RecordId
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
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

const toScalarBucketKey = (
  value: unknown
): BucketKey => {
  if (value === undefined || value === null) {
    return KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length
      ? normalized
      : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? String(value)
      : KANBAN_EMPTY_BUCKET_KEY
  }

  if (typeof value === 'boolean') {
    return value
      ? 'true'
      : 'false'
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const resolveFastBucketKeys = (
  field: Field | undefined,
  value: unknown
): readonly BucketKey[] | undefined => {
  switch (field?.kind) {
    case 'status':
    case 'select':
      return [toScalarBucketKey(value)]
    case 'multiSelect':
      return Array.isArray(value) && value.length
        ? value.map(item => toScalarBucketKey(item))
        : [KANBAN_EMPTY_BUCKET_KEY]
    case 'boolean':
      return value === true
        ? ['true']
        : value === false
          ? ['false']
          : [KANBAN_EMPTY_BUCKET_KEY]
    default:
      return undefined
  }
}

const buildFieldGroupIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): GroupFieldIndex => {
  const field = getDocumentFieldById(document, fieldId)
  const recordBuckets = new Map<RecordId, readonly BucketKey[]>()
  const bucketRecords = new Map<BucketKey, RecordId[]>()
  const values = records.values.get(fieldId)

  if (!field) {
    return {
      recordBuckets,
      bucketRecords
    }
  }

  records.ids.forEach(recordId => {
    const fieldValue = values?.get(recordId)
    const buckets = resolveFastBucketKeys(field, fieldValue)
      ?? resolveFieldGroupBucketEntries(
        field,
        fieldValue
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
  const field = getDocumentFieldById(document, fieldId)
  if (!field) {
    return undefined
  }

  const fieldValue = records.values.get(fieldId)?.get(recordId)
  return resolveFastBucketKeys(field, fieldValue)
    ?? resolveFieldGroupBucketEntries(
      field,
      fieldValue
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
      addBucketMemberships(nextBucketRecords, nextBuckets, recordId, records.order)
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
