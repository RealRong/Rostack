import type { BaseOperation } from '../contracts/operations'
import type { DataDoc } from '../contracts/state'
import {
  clearDocumentValue,
  insertDocumentRecords,
  patchDocumentCustomField,
  patchDocumentRecord,
  patchDocumentValues,
  putDocumentCustomField,
  putDocumentView,
  removeDocumentCustomField,
  removeDocumentRecords,
  removeDocumentView,
  setDocumentValue
} from '../document'

export const reduceOperation = (
  document: DataDoc,
  operation: BaseOperation
): DataDoc => {
  switch (operation.type) {
    case 'document.record.insert':
      return insertDocumentRecords(document, operation.records, operation.target?.index)
    case 'document.record.patch':
      return patchDocumentRecord(document, operation.recordId, operation.patch)
    case 'document.record.remove':
      return removeDocumentRecords(document, operation.recordIds)
    case 'document.value.set':
      return setDocumentValue(document, operation.recordId, operation.field, operation.value)
    case 'document.value.patch':
      return patchDocumentValues(document, operation.recordId, operation.patch)
    case 'document.value.clear':
      return clearDocumentValue(document, operation.recordId, operation.field)
    case 'document.view.put':
      return putDocumentView(document, operation.view)
    case 'document.view.remove':
      return removeDocumentView(document, operation.viewId)
    case 'document.customField.put':
      return putDocumentCustomField(document, operation.field)
    case 'document.customField.patch':
      return patchDocumentCustomField(document, operation.fieldId, operation.patch)
    case 'document.customField.remove':
      return removeDocumentCustomField(document, operation.fieldId)
    case 'external.version.bump':
      return document
  }
}

export const reduceOperations = (
  document: DataDoc,
  operations: readonly BaseOperation[]
): DataDoc => {
  let nextDocument = document

  for (const operation of operations) {
    nextDocument = reduceOperation(nextDocument, operation)
  }

  return nextDocument
}
