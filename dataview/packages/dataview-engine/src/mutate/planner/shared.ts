import type {
  Action,
  CustomField,
  DataDoc,
  EditTarget,
  RecordId,
  View
} from '@dataview/core/contracts'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import { getDocumentRecordById } from '@dataview/core/document'
import { unique } from '@shared/core'
import {
  createIssue,
  hasValidationErrors,
  type IssueSource,
  type ValidationIssue
} from '#engine/mutate/issues.ts'

export const uniqueRecordIds = (target: EditTarget): string[] => (
  target.type === 'record'
    ? [target.recordId]
    : unique(target.recordIds)
)

export interface PlannedActionResult {
  issues: ValidationIssue[]
  operations: BaseOperation[]
}

export const planResult = (
  issues: ValidationIssue[],
  operations: BaseOperation[] = []
): PlannedActionResult => ({
  issues,
  operations: hasValidationErrors(issues)
    ? []
    : operations
})

export const sourceOf = (
  index: number,
  action: Action
): IssueSource => ({
  index,
  type: action.type
})

export const validateBatchItems = (
  source: IssueSource,
  items: readonly unknown[],
  path: string
) => items.length
  ? []
  : [createIssue(source, 'error', 'batch.emptyCollection', `${source.type} requires at least one item`, path)]

export const validateTarget = (
  document: DataDoc,
  source: IssueSource,
  target: EditTarget
) => {
  if (target.type === 'record') {
    return getDocumentRecordById(document, target.recordId)
      ? []
      : [createIssue(source, 'error', 'record.notFound', `Unknown record: ${target.recordId}`, 'target.recordId')]
  }

  const issues = validateBatchItems(source, target.recordIds, 'target.recordIds')
  target.recordIds.forEach((recordId, index) => {
    if (!getDocumentRecordById(document, recordId)) {
      issues.push(createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, `target.recordIds.${index}`))
    }
  })
  return issues
}

export const listTargetRecordIds = (
  target: EditTarget
) => uniqueRecordIds(target) as RecordId[]

export const toViewPut = (
  view: View
): BaseOperation => ({
  type: 'document.view.put',
  view
})

export const toFieldPatch = (
  fieldId: string,
  patch: Partial<Omit<CustomField, 'id'>>
): BaseOperation => ({
  type: 'document.field.patch',
  fieldId,
  patch
})
