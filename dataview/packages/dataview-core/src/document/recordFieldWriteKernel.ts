import { equal } from '@shared/core'
import type {
  DocumentRecordFieldRestoreEntry,
  RecordFieldWriteManyOperationInput
} from '@dataview/core/types/operations'
import type {
  DataRecord,
  FieldId,
  RecordId
} from '@dataview/core/types/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types/state'

export interface AppliedDocumentRecordFieldWrite {
  recordId: RecordId
  changedFields: readonly FieldId[]
  restoreSet?: Partial<Record<FieldId, unknown>>
  restoreClear?: readonly FieldId[]
}

export interface CompiledRecordFieldWrite {
  setEntries: readonly [FieldId, unknown][]
  clear: readonly FieldId[]
}

export interface AppliedCompiledRecordFieldWrite {
  nextRecord: DataRecord
  changedFields: readonly FieldId[]
  restoreSet?: Partial<Record<FieldId, unknown>>
  restoreClear?: readonly FieldId[]
}

const hasOwn = (
  value: Record<string, unknown>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const EMPTY_RECORD_FIELD_WRITES = [] as readonly AppliedDocumentRecordFieldWrite[]

export const compileRecordFieldWrite = (
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

export const compileRestoreRecordFieldWrites = (
  entries: readonly DocumentRecordFieldRestoreEntry[]
): readonly {
  recordId: RecordId
  write: CompiledRecordFieldWrite
}[] => entries.flatMap((entry) => {
  const write = compileRecordFieldWrite(entry)
  return write
    ? [{
        recordId: entry.recordId,
        write
      }]
    : []
})

export const applyCompiledRecordFieldWrite = (
  record: DataRecord,
  write: CompiledRecordFieldWrite
): AppliedCompiledRecordFieldWrite | undefined => {
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
