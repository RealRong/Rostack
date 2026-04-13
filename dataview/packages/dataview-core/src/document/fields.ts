import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  EntityTable,
  Field,
  FieldId,
  TitleField,
  TitleFieldId
} from '#core/contracts/state.ts'
import {
  TITLE_FIELD_ID
} from '#core/contracts/state.ts'
import {
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  patchEntityTableEntity,
  putEntityTableEntity,
  removeEntityTableEntity
} from '#core/document/table.ts'

const replaceDocumentFieldsTable = (
  document: DataDoc,
  fields: EntityTable<CustomFieldId, CustomField>
): DataDoc => {
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

const TITLE_FIELD: TitleField = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true
}

export const getDocumentTitleField = (): TitleField => TITLE_FIELD

export const isDocumentTitleFieldId = (
  fieldId: FieldId
): fieldId is TitleFieldId => fieldId === TITLE_FIELD_ID

export const getDocumentFieldIds = (
  document: DataDoc
): FieldId[] => [
  TITLE_FIELD_ID,
  ...document.fields.order
]

export const getDocumentFieldById = (
  document: DataDoc,
  fieldId: FieldId
): Field | undefined => (
  isDocumentTitleFieldId(fieldId)
    ? TITLE_FIELD
    : getDocumentCustomFieldById(document, fieldId)
)

export const hasDocumentField = (
  document: DataDoc,
  fieldId: FieldId
) => isDocumentTitleFieldId(fieldId)
  || hasDocumentCustomField(document, fieldId)

export const getDocumentFields = (
  document: DataDoc
): Field[] => [
  TITLE_FIELD,
  ...getDocumentCustomFields(document)
]
