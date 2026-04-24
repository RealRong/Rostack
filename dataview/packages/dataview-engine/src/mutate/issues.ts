import type { ActionType } from '@dataview/core/contracts/actions'
import type {
  IssueSeverity,
  ValidationIssue as SharedValidationIssue
} from '@shared/core'

export type ValidationSeverity = IssueSeverity

export type ValidationCode =
  | 'batch.emptyCollection'
  | 'record.notFound'
  | 'record.duplicateId'
  | 'record.invalidId'
  | 'record.hierarchyUnsupported'
  | 'record.invalidIndex'
  | 'record.emptyPatch'
  | 'record.invalidPatch'
  | 'record.fields.invalidField'
  | 'record.fields.emptyWrite'
  | 'record.fields.overlap'
  | 'view.notFound'
  | 'view.invalid'
  | 'view.invalidProjection'
  | 'view.invalidOrder'
  | 'field.notFound'
  | 'field.invalid'
  | 'external.invalidSource'

export interface IssueSource {
  index: number
  type: ActionType
}

export type ValidationIssue = SharedValidationIssue<ValidationCode, IssueSource>

export const createIssue = (
  source: IssueSource,
  severity: ValidationSeverity,
  code: ValidationCode,
  message: string,
  path?: string
): ValidationIssue => ({
  severity,
  code,
  message,
  path,
  source
})

export const hasValidationErrors = (issues: readonly ValidationIssue[]) => issues.some(issue => issue.severity === 'error')
