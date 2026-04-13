export { cloneDocument, normalizeDocument } from '#core/document/normalize.ts'
export * from '#core/document/table.ts'
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
} from '#core/document/fields.ts'
export {
  clearDocumentValue,
  enumerateRecords,
  getDocumentRecordById,
  getDocumentRecordIds,
  getDocumentRecordIndex,
  getDocumentRecords,
  hasDocumentRecord,
  insertDocumentRecords,
  patchDocumentRecord,
  patchDocumentValues,
  removeDocumentRecords,
  replaceDocumentRecords,
  setDocumentValue
} from '#core/document/records.ts'
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
} from '#core/document/views.ts'
