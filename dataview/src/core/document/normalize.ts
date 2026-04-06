import type { DataDoc } from '../contracts/state'
import { normalizeCustomFields } from '../field'
import { cloneEntityTable, cloneRecordTable, normalizeEntityTable, normalizeRecordTable } from './shared'
import { normalizeDocumentViews } from './views'

export const normalizeDocument = (document: DataDoc): DataDoc => {
  const records = normalizeRecordTable(document.records)

  return {
    schemaVersion: document.schemaVersion,
    records,
    fields: normalizeCustomFields(normalizeEntityTable(document.fields)),
    views: normalizeDocumentViews({
      ...document,
      records
    }),
    meta: document.meta ? structuredClone(document.meta) : undefined
  }
}

export const cloneDocument = (document: DataDoc): DataDoc => ({
  schemaVersion: document.schemaVersion,
  records: cloneRecordTable(document.records),
  fields: cloneEntityTable(document.fields),
  views: cloneEntityTable(document.views),
  ...(Object.prototype.hasOwnProperty.call(document, 'meta')
    ? {
        meta: document.meta ? structuredClone(document.meta) : document.meta
      }
    : {})
})
