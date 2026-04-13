import type { DataDoc } from '#core/contracts/state'
import { normalizeCustomFields } from '#core/field/index'
import { cloneEntityTable, cloneRecordTable, normalizeEntityTable, normalizeRecordTable } from '#core/document/table'
import {
  normalizeDocumentViews,
  resolveDocumentActiveViewId
} from '#core/document/views'

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
    activeViewId: resolveDocumentActiveViewId(document),
    meta: document.meta ? structuredClone(document.meta) : undefined
  }
}

export const cloneDocument = (document: DataDoc): DataDoc => ({
  schemaVersion: document.schemaVersion,
  records: cloneRecordTable(document.records),
  fields: cloneEntityTable(document.fields),
  views: cloneEntityTable(document.views),
  activeViewId: resolveDocumentActiveViewId(document),
  ...(Object.prototype.hasOwnProperty.call(document, 'meta')
    ? {
        meta: document.meta ? structuredClone(document.meta) : document.meta
      }
    : {})
})
