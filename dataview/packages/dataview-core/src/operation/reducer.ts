import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import {
  insertDocumentRecords,
  patchDocumentCustomField,
  patchDocumentRecord,
  putDocumentCustomField,
  setDocumentActiveViewId,
  putDocumentView,
  removeDocumentCustomField,
  removeDocumentRecords,
  removeDocumentView,
  restoreDocumentRecordFieldsMany,
  writeDocumentRecordFieldsMany
} from '@dataview/core/document'

export const reduceOperation = (
  document: DataDoc,
  operation: DocumentOperation
): DataDoc => {
  switch (operation.type) {
    case 'document.record.insert':
      return insertDocumentRecords(document, operation.records, operation.target?.index)
    case 'document.record.patch':
      return patchDocumentRecord(document, operation.recordId, operation.patch)
    case 'document.record.remove':
      return removeDocumentRecords(document, operation.recordIds)
    case 'document.record.fields.writeMany':
      return writeDocumentRecordFieldsMany(document, operation)
    case 'document.record.fields.restoreMany':
      return restoreDocumentRecordFieldsMany(document, operation.entries)
    case 'document.view.put':
      return putDocumentView(document, operation.view)
    case 'document.activeView.set':
      return setDocumentActiveViewId(document, operation.viewId)
    case 'document.view.remove':
      return removeDocumentView(document, operation.viewId)
    case 'document.field.put':
      return putDocumentCustomField(document, operation.field)
    case 'document.field.patch':
      return patchDocumentCustomField(document, operation.fieldId, operation.patch)
    case 'document.field.remove':
      return removeDocumentCustomField(document, operation.fieldId)
    case 'external.version.bump':
      return document
  }
}

export const reduceOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DataDoc => {
  let nextDocument = document

  for (const operation of operations) {
    nextDocument = reduceOperation(nextDocument, operation)
  }

  return nextDocument
}
