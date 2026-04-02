import type { GroupDocument } from '../contracts/state'
import { normalizeGroupProperties } from '../property'
import { cloneEntityTable, cloneRecordTable, normalizeEntityTable, normalizeRecordTable } from './shared'
import { normalizeDocumentViews } from './views'

export const normalizeGroupDocument = (document: GroupDocument): GroupDocument => {
  const records = normalizeRecordTable(document.records)

  return {
    schemaVersion: document.schemaVersion,
    records,
    properties: normalizeGroupProperties(normalizeEntityTable(document.properties)),
    views: normalizeDocumentViews({
      ...document,
      records
    }),
    meta: document.meta ? structuredClone(document.meta) : undefined
  }
}

export const cloneGroupDocument = (document: GroupDocument): GroupDocument => ({
  schemaVersion: document.schemaVersion,
  records: cloneRecordTable(document.records),
  properties: cloneEntityTable(document.properties),
  views: cloneEntityTable(document.views),
  ...(Object.prototype.hasOwnProperty.call(document, 'meta')
    ? {
        meta: document.meta ? structuredClone(document.meta) : document.meta
      }
    : {})
})
