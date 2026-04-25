import { equal } from '@shared/core'
import type { DraftEntityTable } from '@shared/draft'
import type {
  DocumentRecordFieldRestoreEntry,
  RecordFieldWriteManyOperationInput
} from '@dataview/core/contracts/operations'
import type {
  DataRecord,
  FieldId,
  RecordId
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import type {
  AppliedDocumentRecordFieldWrite
} from '@dataview/core/document'

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

const hasOwn = (
  value: Record<string, unknown>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(value, key)

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

const applyWriteEntries = (
  records: DraftEntityTable<RecordId, DataRecord>,
  entries: readonly {
    recordId: RecordId
    write: CompiledRecordFieldWrite
  }[]
): readonly AppliedDocumentRecordFieldWrite[] => {
  if (!entries.length) {
    return EMPTY_RECORD_FIELD_WRITES
  }

  const changes: AppliedDocumentRecordFieldWrite[] = []

  entries.forEach((entry) => {
    const current = records.get(entry.recordId)
    if (!current) {
      return
    }

    const applied = applyCompiledRecordFieldWrite(current, entry.write)
    if (!applied) {
      return
    }

    records.byId.set(entry.recordId, applied.nextRecord)
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

  return changes.length
    ? changes
    : EMPTY_RECORD_FIELD_WRITES
}

export const applyRecordFieldWriteInputToDraft = (
  records: DraftEntityTable<RecordId, DataRecord>,
  input: RecordFieldWriteManyOperationInput
): readonly AppliedDocumentRecordFieldWrite[] => {
  const write = compileRecordFieldWrite(input)
  if (!write || !input.recordIds.length) {
    return EMPTY_RECORD_FIELD_WRITES
  }

  return applyWriteEntries(
    records,
    input.recordIds.map((recordId) => ({
      recordId,
      write
    }))
  )
}

export const restoreRecordFieldsToDraft = (
  records: DraftEntityTable<RecordId, DataRecord>,
  entries: readonly DocumentRecordFieldRestoreEntry[]
): readonly AppliedDocumentRecordFieldWrite[] => applyWriteEntries(
  records,
  entries.flatMap((entry) => {
    const write = compileRecordFieldWrite(entry)
    return write
      ? [{
          recordId: entry.recordId,
          write
        }]
      : []
  })
)
