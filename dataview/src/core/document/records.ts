import type { IndexPath, CustomFieldId, DataDoc, EntityTable, Row, RecordId } from '../contracts/state'
import {
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  mergePatchedEntity,
  normalizeRecordInput
} from './shared'

export interface RecordEntry {
  record: Row
  path: IndexPath
  index: number
}

export const enumerateRecords = (
  records: readonly Row[],
  visitor: (entry: RecordEntry) => void
) => {
  records.forEach((record, index) => {
    visitor({ record, path: [index], index })
  })
}

const replaceDocumentRecordsTable = (document: DataDoc, records: EntityTable<RecordId, Row>): DataDoc => {
  if (records === document.records) {
    return document
  }

  return {
    ...document,
    records
  }
}

export const getDocumentRecords = (document: DataDoc): Row[] => {
  return listEntityTable(document.records)
}

export const getDocumentRecordIds = (document: DataDoc): RecordId[] => {
  return getEntityTableIds(document.records)
}

export const getDocumentRecordById = (document: DataDoc, recordId: RecordId): Row | undefined => {
  return getEntityTableById(document.records, recordId)
}

export const hasDocumentRecord = (document: DataDoc, recordId: RecordId) => hasEntityTableId(document.records, recordId)

export const getDocumentRecordIndex = (document: DataDoc, recordId: RecordId) => {
  return document.records.order.indexOf(recordId)
}

export const replaceDocumentRecords = (document: DataDoc, records: readonly Row[]): DataDoc => {
  return replaceDocumentRecordsTable(document, normalizeRecordInput(records))
}

export const insertDocumentRecords = (document: DataDoc, records: readonly Row[], index?: number): DataDoc => {
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

  return replaceDocumentRecordsTable(document, {
    byId: {
      ...document.records.byId,
      ...nextRecords.byId
    },
    order: nextOrder
  })
}

export const patchDocumentRecord = (document: DataDoc, recordId: RecordId, patch: Partial<Omit<Row, 'id'>>): DataDoc => {
  const current = document.records.byId[recordId]
  if (!current) {
    return document
  }

  const nextRecord = mergePatchedEntity(current, patch as Partial<Row>) as Row
  if (nextRecord === current) {
    return document
  }

  return replaceDocumentRecordsTable(document, {
    byId: {
      ...document.records.byId,
      [recordId]: nextRecord
    },
    order: document.records.order
  })
}

export const removeDocumentRecords = (document: DataDoc, recordIds: readonly RecordId[]): DataDoc => {
  if (!recordIds.length) {
    return document
  }

  const removed = new Set(recordIds)
  let removedCount = 0
  const nextById = { ...document.records.byId }

  recordIds.forEach(recordId => {
    if (!Object.prototype.hasOwnProperty.call(nextById, recordId)) {
      return
    }
    removedCount += 1
    delete nextById[recordId]
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
  record: Row
): DataDoc => replaceDocumentRecordsTable(document, {
  byId: {
    ...document.records.byId,
    [recordId]: record
  },
  order: document.records.order
})

const updateDocumentRecord = (
  document: DataDoc,
  recordId: RecordId,
  updater: (record: Row) => Row
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
