import type {
  CommitDelta,
  DataDoc,
  FieldId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentFieldIds
} from '@dataview/core/document'
import {
  getRecordFieldValue,
  resolveFieldGroupBucketEntries
} from '@dataview/core/field'
import type {
  GroupFieldIndex,
  GroupIndex,
  RecordIndex
} from './types'

const buildFieldGroupIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): GroupFieldIndex => {
  const field = getDocumentFieldById(document, fieldId)
  const recordBuckets = new Map<string, readonly string[]>()
  const bucketRecords = new Map<string, string[]>()

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

const collectTouchedFieldIds = (
  delta: CommitDelta
) => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
    || delta.entities.records?.update === 'all'
    || delta.entities.records?.add?.length
    || delta.entities.records?.remove?.length
  ) {
    return 'all' as const
  }

  const fields = new Set<FieldId>()
  delta.entities.fields?.add?.forEach(fieldId => fields.add(fieldId))
  if (Array.isArray(delta.entities.fields?.update)) {
    delta.entities.fields.update.forEach(fieldId => fields.add(fieldId))
  }
  delta.entities.fields?.remove?.forEach(fieldId => fields.add(fieldId))
  if (Array.isArray(delta.entities.values?.fields)) {
    delta.entities.values.fields.forEach(fieldId => fields.add(fieldId))
  }

  for (const item of delta.semantics) {
    if (item.kind === 'record.patch' && item.aspects.includes('title')) {
      fields.add('title')
    }
  }

  return fields
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

  const touched = collectTouchedFieldIds(delta)
  if (touched === 'all') {
    return buildGroupIndex(document, records, previous.rev + 1)
  }

  if (!touched.size) {
    return previous
  }

  const nextFields = new Map(previous.fields)
  touched.forEach(fieldId => {
    if (!getDocumentFieldById(document, fieldId)) {
      nextFields.delete(fieldId)
      return
    }

    nextFields.set(fieldId, buildFieldGroupIndex(document, records, fieldId))
  })

  return {
    fields: nextFields,
    rev: previous.rev + 1
  }
}
