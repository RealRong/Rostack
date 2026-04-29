import type { DraftEntityTable } from '@shared/draft'
import type {
  DocumentRecordFieldRestoreEntry,
  RecordFieldWriteManyOperationInput
} from '@dataview/core/op'
import type {
  DataRecord,
  RecordId
} from '@dataview/core/types/state'
import type {
  AppliedDocumentRecordFieldWrite
} from '@dataview/core/document'
import {
  EMPTY_RECORD_FIELD_WRITES,
  applyCompiledRecordFieldWrite,
  compileRecordFieldWrite,
  compileRestoreRecordFieldWrites,
  type CompiledRecordFieldWrite
} from '@dataview/core/document/recordFieldWriteKernel'

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
  compileRestoreRecordFieldWrites(entries)
)
