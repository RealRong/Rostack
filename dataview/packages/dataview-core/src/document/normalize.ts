import type { DataDoc } from '@dataview/core/types/state'
import { field } from '@dataview/core/field'
import { entityTable as sharedEntityTable } from '@shared/core'
import {
  documentViews
} from '@dataview/core/document/views'

const normalizeDocument = (document: DataDoc): DataDoc => {
  const records = sharedEntityTable.normalize.table(document.records)
  const preferredActiveViewId = documentViews.activeId.resolve(document)
  const nextDocument: DataDoc = {
    schemaVersion: document.schemaVersion,
    records,
    fields: field.schema.normalize(sharedEntityTable.normalize.table(document.fields)),
    views: documentViews.normalize({
      ...document,
      records
    }),
    activeViewId: preferredActiveViewId,
    meta: document.meta ? structuredClone(document.meta) : undefined
  }

  nextDocument.activeViewId = documentViews.activeId.resolve(
    nextDocument,
    preferredActiveViewId
  )
  return nextDocument
}

const cloneDocument = (document: DataDoc): DataDoc => ({
  schemaVersion: document.schemaVersion,
  records: sharedEntityTable.clone.table(document.records),
  fields: sharedEntityTable.clone.table(document.fields),
  views: sharedEntityTable.clone.table(document.views),
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
