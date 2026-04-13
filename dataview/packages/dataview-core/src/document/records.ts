import type { CustomFieldId, DataDoc, DataRecord, EntityTable, IndexPath, RecordId } from '#core/contracts/state.ts'
import {
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  mergePatchedEntity,
  normalizeRecordInput
} from '#core/document/table.ts'

export interface RecordEntry {
  record: DataRecord
  path: IndexPath
  index: number
}

export const enumerateRecords = (
  records: readonly DataRecord[],
  visitor: (entry: RecordEntry) => void
) => {
  records.forEach((record, index) => {
    visitor({ record, path: [index], index })
  })
}

const replaceDocumentRecordsTable = (document: DataDoc, records: EntityTable<RecordId, DataRecord>): DataDoc => {
  if (records === document.records) {
    return document
  }

  return {
    ...document,
    records
  }
}

const createRecordOverlay = (
  document: DataDoc
): Record<RecordId, DataRecord> => Object.create(document.records.byId) as Record<RecordId, DataRecord>

export const getDocumentRecords = (document: DataDoc): DataRecord[] => {
  return listEntityTable(document.records)
}

export const getDocumentRecordIds = (document: DataDoc): RecordId[] => {
  return getEntityTableIds(document.records)
}

export const getDocumentRecordById = (document: DataDoc, recordId: RecordId): DataRecord | undefined => {
  return getEntityTableById(document.records, recordId)
}

export const hasDocumentRecord = (document: DataDoc, recordId: RecordId) => hasEntityTableId(document.records, recordId)

export const getDocumentRecordIndex = (document: DataDoc, recordId: RecordId) => {
  return document.records.order.indexOf(recordId)
}

export const replaceDocumentRecords = (document: DataDoc, records: readonly DataRecord[]): DataDoc => {
  return replaceDocumentRecordsTable(document, normalizeRecordInput(records))
}

export const insertDocumentRecords = (document: DataDoc, records: readonly DataRecord[], index?: number): DataDoc => {
  if (!records.length) {
    return document
  }

  const nextRecords = normalizeRecordInput(records)
  const insertedIds = nextRecords.order
  if (!insertedIds.length) {
    return document
  }

  const insertedIdSet = new Set(insertedIds)
  const remainingOrder = document.records.order.filter(recordId => !insertedIdSet.has(recordId))
  const safeIndex = Math.max(0, Math.min(index ?? remainingOrder.length, remainingOrder.length))
  const nextOrder = [...remainingOrder.slice(0, safeIndex), ...insertedIds, ...remainingOrder.slice(safeIndex)]
  const byId = createRecordOverlay(document)
  insertedIds.forEach(recordId => {
    const record = nextRecords.byId[recordId]
    if (record) {
      byId[recordId] = record
    }
  })

  return replaceDocumentRecordsTable(document, {
    byId,
    order: nextOrder
  })
}

export const patchDocumentRecord = (document: DataDoc, recordId: RecordId, patch: Partial<Omit<DataRecord, 'id'>>): DataDoc => {
  const current = document.records.byId[recordId]
  if (!current) {
    return document
  }

  const nextRecord = mergePatchedEntity(current, patch as Partial<DataRecord>) as DataRecord
  if (nextRecord === current) {
    return document
  }

  return replaceDocumentRecordsTable(document, {
    byId: (() => {
      const byId = createRecordOverlay(document)
      byId[recordId] = nextRecord
      return byId
    })(),
    order: document.records.order
  })
}

export const removeDocumentRecords = (document: DataDoc, recordIds: readonly RecordId[]): DataDoc => {
  if (!recordIds.length) {
    return document
  }

  const removed = new Set(recordIds)
  let removedCount = 0
  const nextById = createRecordOverlay(document)

  recordIds.forEach(recordId => {
    if (!document.records.byId[recordId]) {
      return
    }
    removedCount += 1
    nextById[recordId] = undefined as unknown as DataRecord
  })

  if (!removedCount) {
    return document
  }

  return replaceDocumentRecordsTable(document, {
    byId: nextById,
    order: document.records.order.filter(recordId => !removed.has(recordId))
  })
}

const replaceDocumentRecord = (
  document: DataDoc,
  recordId: RecordId,
  record: DataRecord
): DataDoc => {
  const byId = createRecordOverlay(document)
  byId[recordId] = record
  return replaceDocumentRecordsTable(document, {
    byId,
    order: document.records.order
  })
}

const updateDocumentRecord = (
  document: DataDoc,
  recordId: RecordId,
  updater: (record: DataRecord) => DataRecord
): DataDoc => {
  const record = getDocumentRecordById(document, recordId)
  if (!record) {
    return document
  }

  const nextRecord = updater(record)
  return nextRecord === record
    ? document
    : replaceDocumentRecord(document, recordId, nextRecord)
}

export const setDocumentValue = (document: DataDoc, recordId: RecordId, fieldId: CustomFieldId, value: unknown): DataDoc => {
  return updateDocumentRecord(document, recordId, record => (
    Object.is(record.values[fieldId], value)
      ? record
      : {
          ...record,
          values: {
            ...record.values,
            [fieldId]: value
          }
        }
  ))
}

export const patchDocumentValues = (document: DataDoc, recordId: RecordId, patch: Partial<Record<CustomFieldId, unknown>>): DataDoc => {
  if (!Object.keys(patch).length) {
    return document
  }

  return updateDocumentRecord(document, recordId, record => {
    const changed = Object.keys(patch).some(key => !Object.is(record.values[key], patch[key]))
    if (!changed) {
      return record
    }

    return {
      ...record,
      values: {
        ...record.values,
        ...patch
      }
    }
  })
}

export const clearDocumentValue = (document: DataDoc, recordId: RecordId, fieldId: CustomFieldId): DataDoc => {
  return updateDocumentRecord(document, recordId, record => {
    if (!Object.prototype.hasOwnProperty.call(record.values, fieldId)) {
      return record
    }

    const nextValues = { ...record.values }
    delete nextValues[fieldId]

    return {
      ...record,
      values: nextValues
    }
  })
}
