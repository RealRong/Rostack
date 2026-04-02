import type { IndexPath, PropertyId, GroupDocument, GroupEntityTable, GroupRecord, RecordId } from '../contracts/state'
import {
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  mergePatchedEntity,
  normalizeRecordInput
} from './shared'

export interface RecordEntry {
  record: GroupRecord
  path: IndexPath
  index: number
}

export const enumerateRecords = (
  records: readonly GroupRecord[],
  visitor: (entry: RecordEntry) => void
) => {
  records.forEach((record, index) => {
    visitor({ record, path: [index], index })
  })
}

const replaceDocumentRecordsTable = (document: GroupDocument, records: GroupEntityTable<RecordId, GroupRecord>): GroupDocument => {
  if (records === document.records) {
    return document
  }

  return {
    ...document,
    records
  }
}

export const getDocumentRecords = (document: GroupDocument): GroupRecord[] => {
  return listEntityTable(document.records)
}

export const getDocumentRecordIds = (document: GroupDocument): RecordId[] => {
  return getEntityTableIds(document.records)
}

export const getDocumentRecordById = (document: GroupDocument, recordId: RecordId): GroupRecord | undefined => {
  return getEntityTableById(document.records, recordId)
}

export const hasDocumentRecord = (document: GroupDocument, recordId: RecordId) => hasEntityTableId(document.records, recordId)

export const getDocumentRecordIndex = (document: GroupDocument, recordId: RecordId) => {
  return document.records.order.indexOf(recordId)
}

export const replaceDocumentRecords = (document: GroupDocument, records: readonly GroupRecord[]): GroupDocument => {
  return replaceDocumentRecordsTable(document, normalizeRecordInput(records))
}

export const insertDocumentRecords = (document: GroupDocument, records: readonly GroupRecord[], index?: number): GroupDocument => {
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

export const patchDocumentRecord = (document: GroupDocument, recordId: RecordId, patch: Partial<Omit<GroupRecord, 'id'>>): GroupDocument => {
  const current = document.records.byId[recordId]
  if (!current) {
    return document
  }

  const nextRecord = mergePatchedEntity(current, patch as Partial<GroupRecord>) as GroupRecord
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

export const removeDocumentRecords = (document: GroupDocument, recordIds: readonly RecordId[]): GroupDocument => {
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
  document: GroupDocument,
  recordId: RecordId,
  record: GroupRecord
): GroupDocument => replaceDocumentRecordsTable(document, {
  byId: {
    ...document.records.byId,
    [recordId]: record
  },
  order: document.records.order
})

const updateDocumentRecord = (
  document: GroupDocument,
  recordId: RecordId,
  updater: (record: GroupRecord) => GroupRecord
): GroupDocument => {
  const record = getDocumentRecordById(document, recordId)
  if (!record) {
    return document
  }

  const nextRecord = updater(record)
  return nextRecord === record
    ? document
    : replaceDocumentRecord(document, recordId, nextRecord)
}

export const setDocumentValue = (document: GroupDocument, recordId: RecordId, propertyId: PropertyId, value: unknown): GroupDocument => {
  return updateDocumentRecord(document, recordId, record => (
    Object.is(record.values[propertyId], value)
      ? record
      : {
          ...record,
          values: {
            ...record.values,
            [propertyId]: value
          }
        }
  ))
}

export const patchDocumentValues = (document: GroupDocument, recordId: RecordId, patch: Partial<Record<PropertyId, unknown>>): GroupDocument => {
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

export const clearDocumentValue = (document: GroupDocument, recordId: RecordId, propertyId: PropertyId): GroupDocument => {
  return updateDocumentRecord(document, recordId, record => {
    if (!Object.prototype.hasOwnProperty.call(record.values, propertyId)) {
      return record
    }

    const nextValues = { ...record.values }
    delete nextValues[propertyId]

    return {
      ...record,
      values: nextValues
    }
  })
}
