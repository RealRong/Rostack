import type { DataDoc } from '@dataview/core/contracts/state'
import { normalizeCustomFields } from '@dataview/core/field'
import {
  cloneEntityTable,
  normalizeEntityTable
} from '@dataview/core/document/table'
import {
  normalizeDocumentViews,
  resolveDocumentActiveViewId
} from '@dataview/core/document/views'

export const normalizeDocument = (document: DataDoc): DataDoc => {
  const records = normalizeEntityTable(document.records)

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
  records: cloneEntityTable(document.records),
  fields: cloneEntityTable(document.fields),
  views: cloneEntityTable(document.views),
  activeViewId: resolveDocumentActiveViewId(document),
  ...(Object.prototype.hasOwnProperty.call(document, 'meta')
    ? {
        meta: document.meta ? structuredClone(document.meta) : document.meta
      }
    : {})
})
