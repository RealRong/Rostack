import type { DataDoc } from '@dataview/core/contracts/state'
import { field } from '@dataview/core/field'
import {
  entityTable
} from '@dataview/core/document/table'
import {
  documentViews
} from '@dataview/core/document/views'

const normalizeDocument = (document: DataDoc): DataDoc => {
  const records = entityTable.normalize.table(document.records)
  const nextDocument: DataDoc = {
    schemaVersion: document.schemaVersion,
    records,
    fields: field.schema.normalize(entityTable.normalize.table(document.fields)),
    views: documentViews.normalize({
      ...document,
      records
    }),
    activeViewId: undefined,
    meta: document.meta ? structuredClone(document.meta) : undefined
  }

  nextDocument.activeViewId = documentViews.activeId.resolve(nextDocument)
  return nextDocument
}

const cloneDocument = (document: DataDoc): DataDoc => ({
  schemaVersion: document.schemaVersion,
  records: entityTable.clone.table(document.records),
  fields: entityTable.clone.table(document.fields),
  views: entityTable.clone.table(document.views),
  activeViewId: documentViews.activeId.resolve(document),
  ...(Object.prototype.hasOwnProperty.call(document, 'meta')
    ? {
        meta: document.meta ? structuredClone(document.meta) : document.meta
      }
    : {})
})

export const documentDocument = {
  normalize: normalizeDocument,
  clone: cloneDocument
} as const
