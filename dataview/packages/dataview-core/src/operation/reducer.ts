import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import {
  document as documentApi
} from '@dataview/core/document'

export const reduceOperation = (
  document: DataDoc,
  operation: DocumentOperation
): DataDoc => {
  switch (operation.type) {
    case 'document.record.insert':
      return documentApi.records.insert(document, operation.records, operation.target?.index)
    case 'document.record.patch':
      return documentApi.records.patch(document, operation.recordId, operation.patch)
    case 'document.record.remove':
      return documentApi.records.remove(document, operation.recordIds)
    case 'document.record.fields.writeMany':
      return documentApi.records.writeFields(document, operation)
    case 'document.record.fields.restoreMany':
      return documentApi.records.restoreFields(document, operation.entries)
    case 'document.view.put':
      return documentApi.views.put(document, operation.view)
    case 'document.activeView.set':
      return documentApi.views.activeId.set(document, operation.viewId)
    case 'document.view.remove':
      return documentApi.views.remove(document, operation.viewId)
    case 'document.field.put':
      return documentApi.fields.custom.put(document, operation.field)
    case 'document.field.patch':
      return documentApi.fields.custom.patch(document, operation.fieldId, operation.patch)
    case 'document.field.remove':
      return documentApi.fields.custom.remove(document, operation.fieldId)
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
