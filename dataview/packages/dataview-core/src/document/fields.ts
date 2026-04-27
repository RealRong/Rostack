import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  Field,
  FieldId,
  TitleField,
  TitleFieldId
} from '@dataview/core/types/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types/state'
import {
  entityTable
} from '@dataview/core/document/table'

const listCustomFields = (document: DataDoc): CustomField[] => {
  return entityTable.read.list(document.fields)
}

const getCustomFieldIds = (document: DataDoc): CustomFieldId[] => entityTable.read.ids(document.fields)
const getCustomField = (document: DataDoc, fieldId: CustomFieldId) => entityTable.read.get(document.fields, fieldId)
const hasCustomField = (document: DataDoc, fieldId: CustomFieldId) => entityTable.read.has(document.fields, fieldId)

const putCustomField = (document: DataDoc, field: CustomField): DataDoc => {
  return entityTable.replace(document, 'fields', entityTable.write.put(document.fields, field))
}

const patchCustomField = (
  document: DataDoc,
  fieldId: CustomFieldId,
  patch: Partial<Omit<CustomField, 'id'>>
): DataDoc => {
  const nextFields = entityTable.write.patch(document.fields, fieldId, patch)
  if (nextFields === document.fields) {
    return document
  }

  return entityTable.replace(document, 'fields', nextFields)
}

const removeCustomField = (document: DataDoc, fieldId: CustomFieldId): DataDoc => {
  const nextFields = entityTable.write.remove(document.fields, fieldId)
  if (nextFields === document.fields) {
    return document
  }

  return entityTable.replace(document, 'fields', nextFields)
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
  list: listFields,
  ids: getFieldIds,
  get: getField,
  has: hasField
} as const

export const documentSchema = {
  fields: {
    list: listCustomFields,
    ids: getCustomFieldIds,
    get: getCustomField,
    has: hasCustomField,
    put: putCustomField,
    patch: patchCustomField,
    remove: removeCustomField
  }
} as const
