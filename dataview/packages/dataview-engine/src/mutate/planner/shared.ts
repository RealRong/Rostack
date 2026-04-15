import type {
  Action,
  CustomField,
  EditTarget,
  RecordId,
  View
} from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { unique } from '@shared/core'
import {
  hasValidationErrors,
  type IssueSource,
  type ValidationIssue
} from '@dataview/engine/mutate/issues'

export const uniqueRecordIds = (target: EditTarget): string[] => (
  target.type === 'record'
    ? [target.recordId]
    : unique(target.recordIds)
)

export interface PlannedActionResult {
  issues: ValidationIssue[]
  operations: DocumentOperation[]
}

export const planResult = (
  issues: ValidationIssue[],
  operations: DocumentOperation[] = []
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

export const listTargetRecordIds = (
  target: EditTarget
) => uniqueRecordIds(target) as RecordId[]

export const toViewPut = (
  view: View
): DocumentOperation => ({
  type: 'document.view.put',
  view
})

export const toFieldPatch = (
  fieldId: string,
  patch: Partial<Omit<CustomField, 'id'>>
): DocumentOperation => ({
  type: 'document.field.patch',
  fieldId,
  patch
})
