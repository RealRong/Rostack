import type {
  DataDoc,
  DataRecord,
  FieldId,
  IndexPath,
  RecordId
} from '@dataview/core/types/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types/state'
import type {
  DocumentRecordFieldRestoreEntry,
  RecordFieldWriteManyOperationInput
} from '@dataview/core/op'
import { entityTable as sharedEntityTable, equal } from '@shared/core'

const replaceTable = <TKey extends 'fields' | 'records' | 'views'>(
  document: DataDoc,
  key: TKey,
  table: DataDoc[TKey]
): DataDoc => document[key] === table
  ? document
  : {
      ...document,
      [key]: table
    }

export interface RecordEntry {
  record: DataRecord
  path: IndexPath
  index: number
}

export interface AppliedDocumentRecordFieldWrite {
  recordId: RecordId
  changedFields: readonly FieldId[]
  restoreSet?: Partial<Record<FieldId, unknown>>
  restoreClear?: readonly FieldId[]
}

export interface DocumentRecordFieldWriteResult {
  document: DataDoc
  changes: readonly AppliedDocumentRecordFieldWrite[]
}

interface CompiledRecordFieldWrite {
  setEntries: readonly [FieldId, unknown][]
  clear: readonly FieldId[]
}

interface CompiledRecordFieldWriteResult {
  nextRecord: DataRecord
  changedFields: readonly FieldId[]
  restoreSet?: Partial<Record<FieldId, unknown>>
  restoreClear?: readonly FieldId[]
}

const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key)

const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_RECORD_FIELD_WRITES = [] as readonly AppliedDocumentRecordFieldWrite[]

const compileRecordFieldWrite = (
  write: Pick<RecordFieldWriteManyOperationInput, 'set' | 'clear'>
): CompiledRecordFieldWrite | undefined => {
  const nextSetEntries: [FieldId, unknown][] = []
  const clearSet = new Set<FieldId>(write.clear ?? [])

  for (const [fieldId, value] of Object.entries(write.set ?? {}) as [FieldId, unknown][]) {
    if (value === undefined) {
      clearSet.add(fieldId)
      continue
    }
    nextSetEntries.push([fieldId, value])
  }

  const clear = Array.from(clearSet)

  return nextSetEntries.length || clear.length
    ? {
        setEntries: nextSetEntries,
        clear
      }
    : undefined
}

const applyCompiledRecordFieldWrite = (
  record: DataRecord,
  write: CompiledRecordFieldWrite
): CompiledRecordFieldWriteResult | undefined => {
  let nextTitle = record.title
  let titleChanged = false
  let nextValues = record.values
  let valuesChanged = false
  let restoreSet: Partial<Record<FieldId, unknown>> | undefined
  let restoreClear: FieldId[] | undefined
  let changedFields: FieldId[] | undefined

  const markChanged = (fieldId: FieldId) => {
    if (!changedFields) {
      changedFields = []
    }
    changedFields.push(fieldId)
  }

  const rememberRestoreValue = (fieldId: FieldId, value: unknown) => {
    if (!restoreSet) {
      restoreSet = {}
    }
    restoreSet[fieldId] = value
  }

  const rememberRestoreClear = (fieldId: FieldId) => {
    if (!restoreClear) {
      restoreClear = []
    }
    restoreClear.push(fieldId)
  }

  const clearValue = (fieldId: FieldId) => {
    if (fieldId === TITLE_FIELD_ID) {
      if (nextTitle === '') {
        return
      }

      markChanged(fieldId)
      if (record.title === '') {
        rememberRestoreClear(fieldId)
      } else {
        rememberRestoreValue(fieldId, record.title)
      }
      nextTitle = ''
      titleChanged = true
      return
    }

    if (!hasOwn(nextValues, fieldId)) {
      return
    }

    markChanged(fieldId)
    rememberRestoreValue(fieldId, record.values[fieldId])
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

      markChanged(fieldId)
      if (record.title === '') {
        rememberRestoreClear(fieldId)
      } else {
        rememberRestoreValue(fieldId, record.title)
      }
      nextTitle = nextValue
      titleChanged = true
      return
    }

    const beforeHas = hasOwn(record.values, fieldId)
    const beforeValue = record.values[fieldId]
    if (beforeHas && equal.sameJsonValue(beforeValue, value)) {
      return
    }

    if (!beforeHas) {
      rememberRestoreClear(fieldId)
    } else {
      rememberRestoreValue(fieldId, beforeValue)
    }
    markChanged(fieldId)
    if (!valuesChanged) {
      nextValues = { ...nextValues }
      valuesChanged = true
    }

    nextValues[fieldId] = value
  })

  write.clear.forEach(clearValue)

  if (!changedFields?.length) {
    return undefined
  }

  return {
    nextRecord: {
      ...record,
      ...(titleChanged
        ? { title: nextTitle }
        : {}),
      ...(valuesChanged
        ? { values: nextValues }
        : {})
    },
    changedFields,
    ...(restoreSet
      ? { restoreSet }
      : {}),
    ...(restoreClear?.length
      ? { restoreClear }
      : {})
  }
}

const applyRecordFieldWriteEntries = (
  document: DataDoc,
  entries: readonly {
    recordId: RecordId
    write: CompiledRecordFieldWrite
  }[]
): DocumentRecordFieldWriteResult => {
  if (!entries.length) {
    return {
      document,
      changes: EMPTY_RECORD_FIELD_WRITES
    }
  }

  let nextById: Record<RecordId, DataRecord> | undefined
  const changes: AppliedDocumentRecordFieldWrite[] = []

  entries.forEach(entry => {
    const current = document.records.byId[entry.recordId]
    if (!current) {
      return
    }

    const applied = applyCompiledRecordFieldWrite(current, entry.write)
    if (!applied) {
      return
    }

    if (!nextById) {
      nextById = {
        ...document.records.byId
      }
    }

    nextById[entry.recordId] = applied.nextRecord
    changes.push({
      recordId: entry.recordId,
      changedFields: applied.changedFields,
      ...(applied.restoreSet
        ? { restoreSet: applied.restoreSet }
        : {}),
      ...(applied.restoreClear?.length
        ? { restoreClear: applied.restoreClear }
        : {})
    })
  })

  if (!changes.length || !nextById) {
    return {
      document,
      changes: EMPTY_RECORD_FIELD_WRITES
    }
  }

  return {
    document: replaceTable(document, 'records', {
      byId: nextById,
      ids: document.records.ids
    }),
    changes
  }
}

const enumerate = (
  records: readonly DataRecord[],
  visitor: (entry: RecordEntry) => void
) => {
  records.forEach((record, index) => {
    visitor({ record, path: [index], index })
  })
}

const listRecords = (document: DataDoc): DataRecord[] => {
  return sharedEntityTable.read.list(document.records)
}

const getRecordIds = (document: DataDoc): RecordId[] => {
  return sharedEntityTable.read.ids(document.records)
}

const getRecord = (document: DataDoc, recordId: RecordId): DataRecord | undefined => {
  return sharedEntityTable.read.get(document.records, recordId)
}

const hasRecord = (document: DataDoc, recordId: RecordId) => sharedEntityTable.read.has(document.records, recordId)

const getRecordIndex = (document: DataDoc, recordId: RecordId) => {
  return document.records.ids.indexOf(recordId)
}

const replaceRecords = (document: DataDoc, records: readonly DataRecord[]): DataDoc => {
  return replaceTable(document, 'records', sharedEntityTable.normalize.list(records))
}

const insertRecords = (document: DataDoc, records: readonly DataRecord[], index?: number): DataDoc => {
  if (!records.length) {
    return document
  }

  const nextRecords = sharedEntityTable.normalize.list(records)
  const insertedIds = nextRecords.ids
  if (!insertedIds.length) {
    return document
  }

  const insertedIdSet = new Set(insertedIds)
  const remainingIds = document.records.ids.filter(recordId => !insertedIdSet.has(recordId))
  const safeIndex = Math.max(0, Math.min(index ?? remainingIds.length, remainingIds.length))
  const nextIds = [...remainingIds.slice(0, safeIndex), ...insertedIds, ...remainingIds.slice(safeIndex)]
  const byId = {
    ...document.records.byId
  }
  insertedIds.forEach(recordId => {
    const record = nextRecords.byId[recordId]
    if (record) {
      byId[recordId] = record
    }
  })

  return replaceTable(document, 'records', {
    byId,
    ids: nextIds
  })
}

const patchRecord = (
  document: DataDoc,
  recordId: RecordId,
  patch: Partial<Omit<DataRecord, 'id' | 'values'>>
): DataDoc => {
  const current = document.records.byId[recordId]
  if (!current) {
    return document
  }

  const nextRecord = sharedEntityTable.patch.merge(current, patch as Partial<DataRecord>) as DataRecord
  if (nextRecord === current) {
    return document
  }

  return replaceTable(document, 'records', {
    byId: (() => {
      const byId = {
        ...document.records.byId
      }
      byId[recordId] = nextRecord
      return byId
    })(),
    ids: document.records.ids
  })
}

const removeRecords = (document: DataDoc, recordIds: readonly RecordId[]): DataDoc => {
  if (!recordIds.length) {
    return document
  }

  const removed = new Set(recordIds)
  let removedCount = 0
  const nextById = {
    ...document.records.byId
  }

  recordIds.forEach(recordId => {
    if (!document.records.byId[recordId]) {
      return
    }
    removedCount += 1
    delete nextById[recordId]
  })

  if (!removedCount) {
    return document
  }

  return replaceTable(document, 'records', {
    byId: nextById,
    ids: document.records.ids.filter(recordId => !removed.has(recordId))
  })
}

const writeRecordFields = (
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
  ).document
}

const restoreRecordFields = (
  document: DataDoc,
  entries: readonly DocumentRecordFieldRestoreEntry[]
): DataDoc => restoreRecordFieldsWithChanges(document, entries).document

const writeRecordFieldsWithChanges = (
  document: DataDoc,
  input: RecordFieldWriteManyOperationInput
): DocumentRecordFieldWriteResult => {
  const write = compileRecordFieldWrite(input)
  if (!write || !input.recordIds.length) {
    return {
      document,
      changes: EMPTY_RECORD_FIELD_WRITES
    }
  }

  const writeEntries = new Array<{
    recordId: RecordId
    write: CompiledRecordFieldWrite
  }>(input.recordIds.length)
  for (let index = 0; index < input.recordIds.length; index += 1) {
    writeEntries[index] = {
      recordId: input.recordIds[index]!,
      write
    }
  }

  return applyRecordFieldWriteEntries(document, writeEntries)
}

const restoreRecordFieldsWithChanges = (
  document: DataDoc,
  entries: readonly DocumentRecordFieldRestoreEntry[]
): DocumentRecordFieldWriteResult => {
  if (!entries.length) {
    return {
      document,
      changes: EMPTY_RECORD_FIELD_WRITES
    }
  }

  const writeEntries: {
    recordId: RecordId
    write: CompiledRecordFieldWrite
  }[] = []
  for (const entry of entries) {
    const write = compileRecordFieldWrite(entry)
    if (!write) {
      continue
    }
    writeEntries.push({
      recordId: entry.recordId,
      write
    })
  }

  return applyRecordFieldWriteEntries(document, writeEntries)
}

export const documentRecords = {
  enumerate,
  list: listRecords,
  ids: getRecordIds,
  get: getRecord,
  has: hasRecord,
  indexOf: getRecordIndex,
  replace: replaceRecords,
  insert: insertRecords,
  patch: patchRecord,
  remove: removeRecords,
  writeFields: writeRecordFields,
  writeFieldsWithChanges: writeRecordFieldsWithChanges,
  restoreFields: restoreRecordFields,
  restoreFieldsWithChanges: restoreRecordFieldsWithChanges
} as const
