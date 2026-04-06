import type {
  DataDoc,
  Field,
  FieldId,
  TitleField,
  TitleFieldId
} from '../contracts/state'
import {
  TITLE_FIELD_ID
} from '../contracts/state'
import {
  getDocumentCustomFields,
  getDocumentCustomFieldById
} from './customFields'

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

export const getDocumentFields = (
  document: DataDoc
): Field[] => [
  TITLE_FIELD,
  ...getDocumentCustomFields(document)
]
