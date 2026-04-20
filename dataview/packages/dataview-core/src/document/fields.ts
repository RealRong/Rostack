import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  Field,
  FieldId,
  TitleField,
  TitleFieldId
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import {
  getEntityTableById,
  getEntityTableIds,
  hasEntityTableId,
  listEntityTable,
  patchEntityTableEntity,
  putEntityTableEntity,
  replaceDocumentTable,
  removeEntityTableEntity
} from '@dataview/core/document/table'

const listCustomFields = (document: DataDoc): CustomField[] => {
  return listEntityTable(document.fields)
}

const getCustomFieldIds = (document: DataDoc): CustomFieldId[] => getEntityTableIds(document.fields)
const getCustomField = (document: DataDoc, fieldId: CustomFieldId) => getEntityTableById(document.fields, fieldId)
const hasCustomField = (document: DataDoc, fieldId: CustomFieldId) => hasEntityTableId(document.fields, fieldId)

const putCustomField = (document: DataDoc, field: CustomField): DataDoc => {
  return replaceDocumentTable(document, 'fields', putEntityTableEntity(document.fields, field))
}

const patchCustomField = (
  document: DataDoc,
  fieldId: CustomFieldId,
  patch: Partial<Omit<CustomField, 'id'>>
): DataDoc => {
  const nextFields = patchEntityTableEntity(document.fields, fieldId, patch)
  if (nextFields === document.fields) {
    return document
  }

  return replaceDocumentTable(document, 'fields', nextFields)
}

const removeCustomField = (document: DataDoc, fieldId: CustomFieldId): DataDoc => {
  const nextFields = removeEntityTableEntity(document.fields, fieldId)
  if (nextFields === document.fields) {
    return document
  }

  return replaceDocumentTable(document, 'fields', nextFields)
}

const TITLE_FIELD: TitleField = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true
}

const getTitleField = (): TitleField => TITLE_FIELD

const isTitleFieldId = (
  fieldId: FieldId
): fieldId is TitleFieldId => fieldId === TITLE_FIELD_ID

const getFieldIds = (
  document: DataDoc
): FieldId[] => [
  TITLE_FIELD_ID,
  ...document.fields.order
]

const getField = (
  document: DataDoc,
  fieldId: FieldId
): Field | undefined => (
  isTitleFieldId(fieldId)
    ? TITLE_FIELD
    : getCustomField(document, fieldId)
)

const hasField = (
  document: DataDoc,
  fieldId: FieldId
) => isTitleFieldId(fieldId)
  || hasCustomField(document, fieldId)

const listFields = (
  document: DataDoc
): Field[] => [
  TITLE_FIELD,
  ...listCustomFields(document)
]

export const documentFields = {
  title: {
    get: getTitleField,
    isId: isTitleFieldId
  },
  custom: {
    list: listCustomFields,
    ids: getCustomFieldIds,
    get: getCustomField,
    has: hasCustomField,
    put: putCustomField,
    patch: patchCustomField,
    remove: removeCustomField
  },
  list: listFields,
  ids: getFieldIds,
  get: getField,
  has: hasField,
  put: putCustomField,
  patch: patchCustomField,
  remove: removeCustomField
} as const
