import type { GroupBaseOperation } from '../contracts/operations'
import type { GroupDocument } from '../contracts/state'
import {
  clearDocumentValue,
  insertDocumentRecords,
  patchDocumentProperty,
  patchDocumentRecord,
  patchDocumentValues,
  putDocumentProperty,
  putDocumentView,
  removeDocumentProperty,
  removeDocumentRecords,
  removeDocumentView,
  setDocumentValue
} from '../document'

export const reduceOperation = (
  document: GroupDocument,
  operation: GroupBaseOperation
): GroupDocument => {
  switch (operation.type) {
    case 'document.record.insert':
      return insertDocumentRecords(document, operation.records, operation.target?.index)
    case 'document.record.patch':
      return patchDocumentRecord(document, operation.recordId, operation.patch)
    case 'document.record.remove':
      return removeDocumentRecords(document, operation.recordIds)
    case 'document.value.set':
      return setDocumentValue(document, operation.recordId, operation.property, operation.value)
    case 'document.value.patch':
      return patchDocumentValues(document, operation.recordId, operation.patch)
    case 'document.value.clear':
      return clearDocumentValue(document, operation.recordId, operation.property)
    case 'document.view.put':
      return putDocumentView(document, operation.view)
    case 'document.view.remove':
      return removeDocumentView(document, operation.viewId)
    case 'document.property.put':
      return putDocumentProperty(document, operation.property)
    case 'document.property.patch':
      return patchDocumentProperty(document, operation.propertyId, operation.patch)
    case 'document.property.remove':
      return removeDocumentProperty(document, operation.propertyId)
    case 'external.version.bump':
      return document
  }
}

export const reduceOperations = (
  document: GroupDocument,
  operations: readonly GroupBaseOperation[]
): GroupDocument => {
  let nextDocument = document

  for (const operation of operations) {
    nextDocument = reduceOperation(nextDocument, operation)
  }

  return nextDocument
}
