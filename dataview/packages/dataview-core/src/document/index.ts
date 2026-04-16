export { cloneDocument, normalizeDocument } from '@dataview/core/document/normalize'
export * from '@dataview/core/document/table'
export {
  getDocumentCustomFieldById,
  getDocumentCustomFieldIds,
  getDocumentCustomFields,
  getDocumentFieldById,
  getDocumentFieldIds,
  getDocumentFields,
  getDocumentTitleField,
  hasDocumentField,
  hasDocumentCustomField,
  isDocumentTitleFieldId,
  patchDocumentCustomField,
  putDocumentCustomField,
  removeDocumentCustomField
} from '@dataview/core/document/fields'
export {
  type AppliedDocumentRecordFieldWrite,
  type DocumentRecordFieldWriteResult,
  enumerateRecords,
  getDocumentRecordById,
  getDocumentRecordIds,
  getDocumentRecordIndex,
  getDocumentRecords,
  hasDocumentRecord,
  insertDocumentRecords,
  patchDocumentRecord,
  removeDocumentRecords,
  restoreDocumentRecordFieldsMany,
  restoreDocumentRecordFieldsManyWithChanges,
  replaceDocumentRecords,
  writeDocumentRecordFieldsMany,
  writeDocumentRecordFieldsManyWithChanges
} from '@dataview/core/document/records'
export {
  getDocumentActiveView,
  getDocumentActiveViewId,
  getDocumentViewById,
  getDocumentViewIds,
  getDocumentViews,
  hasDocumentView,
  normalizeDocumentViews,
  normalizeViewOrders,
  putDocumentView,
  resolveDocumentActiveViewId,
  removeDocumentView,
  setDocumentActiveViewId
} from '@dataview/core/document/views'
