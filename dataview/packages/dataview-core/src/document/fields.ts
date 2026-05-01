import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  Field,
  FieldId,
  TitleFieldId
} from '@dataview/core/types/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types/state'
import { entityTable } from '@shared/core'

const getCustomField = (document: DataDoc, fieldId: CustomFieldId) => entityTable.read.get(document.fields, fieldId)

const TITLE_FIELD: Extract<Field, { kind: 'title' }> = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true
}

const isTitleFieldId = (
  fieldId: FieldId
): fieldId is TitleFieldId => fieldId === TITLE_FIELD_ID

const getFieldIds = (
  document: DataDoc
): FieldId[] => [
  TITLE_FIELD_ID,
  ...document.fields.ids
]

const getField = (
  document: DataDoc,
  fieldId: FieldId
): Field | undefined => (
  isTitleFieldId(fieldId)
    ? TITLE_FIELD
    : getCustomField(document, fieldId)
)

const listFields = (
  document: DataDoc
): Field[] => [
  TITLE_FIELD,
  ...entityTable.read.list(document.fields)
]

export const documentFields = {
  list: listFields,
  ids: getFieldIds,
  get: getField
} as const
