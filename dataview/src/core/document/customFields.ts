import type { CustomFieldId, DataDoc, EntityTable, CustomField } from '../contracts/state'
import {
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  patchEntityTableEntity,
  putEntityTableEntity,
  removeEntityTableEntity
} from './shared'

const replaceDocumentFieldsTable = (document: DataDoc, fields: EntityTable<CustomFieldId, CustomField>): DataDoc => {
  if (fields === document.fields) {
    return document
  }

  return {
    ...document,
    fields
  }
}

export const getDocumentCustomFields = (document: DataDoc): CustomField[] => {
  return listEntityTable(document.fields)
}

export const getDocumentCustomFieldIds = (document: DataDoc): CustomFieldId[] => getEntityTableIds(document.fields)
export const getDocumentCustomFieldById = (document: DataDoc, fieldId: CustomFieldId) => getEntityTableById(document.fields, fieldId)
export const hasDocumentCustomField = (document: DataDoc, fieldId: CustomFieldId) => hasEntityTableId(document.fields, fieldId)

export const putDocumentCustomField = (document: DataDoc, field: CustomField): DataDoc => {
  return replaceDocumentFieldsTable(document, putEntityTableEntity(document.fields, field))
}

export const patchDocumentCustomField = (document: DataDoc, fieldId: CustomFieldId, patch: Partial<Omit<CustomField, 'id'>>): DataDoc => {
  const nextFields = patchEntityTableEntity(document.fields, fieldId, patch)
  if (nextFields === document.fields) {
    return document
  }

  return replaceDocumentFieldsTable(document, nextFields)
}

export const removeDocumentCustomField = (document: DataDoc, fieldId: CustomFieldId): DataDoc => {
  const nextFields = removeEntityTableEntity(document.fields, fieldId)
  if (nextFields === document.fields) {
    return document
  }

  return replaceDocumentFieldsTable(document, nextFields)
}
