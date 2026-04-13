import type {
  CustomField,
  CustomFieldId,
  DataDoc
} from '@dataview/core/contracts'
import {
  getDocumentCustomFieldById,
  getDocumentCustomFields
} from '@dataview/core/document'

export const readDocumentFieldIds = (
  document: DataDoc
): readonly CustomFieldId[] => document.fields.order

export const listDocumentFields = (
  document: DataDoc
): readonly CustomField[] => getDocumentCustomFields(document)

export const readDocumentField = (
  document: DataDoc,
  fieldId: CustomFieldId
): CustomField | undefined => getDocumentCustomFieldById(document, fieldId)

export const hasDocumentField = (
  document: DataDoc,
  fieldId: CustomFieldId
): boolean => Boolean(readDocumentField(document, fieldId))
