import type {
  CustomFieldId,
  DataDoc,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  hasDocumentCustomField,
  hasDocumentRecord,
  hasDocumentView
} from '@dataview/core/document'
import {
  createIssue,
  type IssueSource,
  type ValidationIssue
} from '#dataview-engine/mutate/issues'

export const validateRecordExists = (
  document: DataDoc,
  source: IssueSource,
  recordId: RecordId,
  path = 'recordId'
): ValidationIssue[] => hasDocumentRecord(document, recordId)
  ? []
  : [createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, path)]

export const validateFieldExists = (
  document: DataDoc,
  source: IssueSource,
  fieldId: CustomFieldId,
  path = 'fieldId'
): ValidationIssue[] => hasDocumentCustomField(document, fieldId)
  ? []
  : [createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, path)]

export const validateViewExists = (
  document: DataDoc,
  source: IssueSource,
  viewId: ViewId,
  path = 'viewId'
): ValidationIssue[] => hasDocumentView(document, viewId)
  ? []
  : [createIssue(source, 'error', 'view.notFound', `Unknown view: ${viewId}`, path)]
