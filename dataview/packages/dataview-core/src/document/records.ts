import type {
  DataDoc,
  DataRecord,
  FieldId,
  IndexPath,
  RecordId
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import type {
  DocumentRecordFieldRestoreEntry,
  RecordFieldWriteManyOperationInput
} from '@dataview/core/contracts/operations'
import {
  createEntityOverlay,
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  mergePatchedEntity,
  normalizeRecordInput,
  replaceDocumentTable
} from '@dataview/core/document/table'

export interface RecordEntry {
  record: DataRecord
  path: IndexPath
  index: number
}

interface CompiledRecordFieldWrite {
  setEntries: readonly [FieldId, unknown][]
  clear: readonly FieldId[]
}

const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key)

const compileRecordFieldWrite = (
  write: Pick<RecordFieldWriteManyOperationInput, 'set' | 'clear'>
): CompiledRecordFieldWrite | undefined => {
  const setEntries = Object.entries(write.set ?? {}) as [FieldId, unknown][]
  const clear = [...new Set(write.clear ?? [])]

  return setEntries.length || clear.length
    ? {
        setEntries,
        clear
      }
    : undefined
}

const applyCompiledRecordFieldWrite = (
  record: DataRecord,
  write: CompiledRecordFieldWrite
): DataRecord => {
  let nextTitle = record.title
  let titleChanged = false
  let nextValues = record.values
  let valuesChanged = false

  const clearValue = (fieldId: FieldId) => {
    if (fieldId === TITLE_FIELD_ID) {
      if (nextTitle === '') {
        return
      }

      nextTitle = ''
      titleChanged = true
      return
    }

    if (!hasOwn(nextValues, fieldId)) {
      return
    }

    if (!valuesChanged) {
      nextValues = { ...nextValues }
      valuesChanged = true
    }

    delete nextValues[fieldId]
  }

  write.setEntries.forEach(([fieldId, value]) => {
    if (value === undefined) {
      clearValue(fieldId)
      return
    }

    if (fieldId === TITLE_FIELD_ID) {
      const nextValue = String(value ?? '')
      if (nextTitle === nextValue) {
        return
      }

      nextTitle = nextValue
      titleChanged = true
      return
    }

    if (hasOwn(nextValues, fieldId) && Object.is(nextValues[fieldId], value)) {
      return
    }

    if (!valuesChanged) {
      nextValues = { ...nextValues }
      valuesChanged = true
    }

    nextValues[fieldId] = value
  })

  write.clear.forEach(clearValue)

  if (!titleChanged && !valuesChanged) {
    return record
  }

  return {
    ...record,
    ...(titleChanged
      ? { title: nextTitle }
      : {}),
    ...(valuesChanged
      ? { values: nextValues }
      : {})
  }
}

const applyRecordFieldWriteEntries = (
  document: DataDoc,
  entries: readonly {
    recordId: RecordId
    write: CompiledRecordFieldWrite
  }[]
): DataDoc => {
  if (!entries.length) {
    return document
  }

  let nextById: Record<RecordId, DataRecord> | undefined
  let changed = false

  entries.forEach(entry => {
    const current = document.records.byId[entry.recordId]
    if (!current) {
      return
    }

    const nextRecord = applyCompiledRecordFieldWrite(current, entry.write)
    if (nextRecord === current) {
      return
    }

    if (!nextById) {
      nextById = createEntityOverlay(document.records)
    }

    nextById[entry.recordId] = nextRecord
    changed = true
  })

  if (!changed || !nextById) {
    return document
  }

  return replaceDocumentTable(document, 'records', {
    byId: nextById,
    order: document.records.order
  })
}

export const enumerateRecords = (
  records: readonly DataRecord[],
  visitor: (entry: RecordEntry) => void
) => {
  records.forEach((record, index) => {
    visitor({ record, path: [index], index })
  })
}

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
  return replaceDocumentTable(document, 'records', normalizeRecordInput(records))
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
  const byId = createEntityOverlay(document.records)
  insertedIds.forEach(recordId => {
    const record = nextRecords.byId[recordId]
    if (record) {
      byId[recordId] = record
    }
  })

  return replaceDocumentTable(document, 'records', {
    byId,
    order: nextOrder
  })
}

export const patchDocumentRecord = (
  document: DataDoc,
  recordId: RecordId,
  patch: Partial<Omit<DataRecord, 'id' | 'values'>>
): DataDoc => {
  const current = document.records.byId[recordId]
  if (!current) {
    return document
  }

  const nextRecord = mergePatchedEntity(current, patch as Partial<DataRecord>) as DataRecord
  if (nextRecord === current) {
    return document
  }

  return replaceDocumentTable(document, 'records', {
    byId: (() => {
      const byId = createEntityOverlay(document.records)
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
  const nextById = createEntityOverlay(document.records)

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

  return replaceDocumentTable(document, 'records', {
    byId: nextById,
    order: document.records.order.filter(recordId => !removed.has(recordId))
  })
}

export const writeDocumentRecordFieldsMany = (
  document: DataDoc,
  input: RecordFieldWriteManyOperationInput
): DataDoc => {
  const write = compileRecordFieldWrite(input)
  if (!write || !input.recordIds.length) {
    return document
  }

  return applyRecordFieldWriteEntries(
    document,
    input.recordIds.map(recordId => ({
      recordId,
      write
    }))
  )
}

export const restoreDocumentRecordFieldsMany = (
  document: DataDoc,
  entries: readonly DocumentRecordFieldRestoreEntry[]
): DataDoc => applyRecordFieldWriteEntries(
  document,
  entries.flatMap(entry => {
    const write = compileRecordFieldWrite(entry)
    return write
      ? [{
          recordId: entry.recordId,
          write
        }]
      : []
  })
)
