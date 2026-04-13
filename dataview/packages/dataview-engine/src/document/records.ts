import type { DataDoc, DataRecord, RecordId } from '@dataview/core/contracts'
import { getDocumentRecordById, getDocumentRecords } from '@dataview/core/document'

export const readDocumentRecordIds = (
  document: DataDoc
): readonly RecordId[] => document.records.order

export const listDocumentRecords = (
  document: DataDoc
): readonly DataRecord[] => getDocumentRecords(document)

export const readDocumentRecord = (
  document: DataDoc,
  recordId: RecordId
): DataRecord | undefined => getDocumentRecordById(document, recordId)

export const hasDocumentRecord = (
  document: DataDoc,
  recordId: RecordId
): boolean => Boolean(readDocumentRecord(document, recordId))
