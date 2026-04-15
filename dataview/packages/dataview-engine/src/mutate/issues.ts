import type { ActionType } from '@dataview/core/contracts/actions'

export type ValidationSeverity = 'error' | 'warning'

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

export interface ValidationIssue {
  severity: ValidationSeverity
  code: ValidationCode
  message: string
  actionIndex: number
  actionType: ActionType
  path?: string
}

export interface IssueSource {
  index: number
  type: ActionType
}

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
  actionIndex: source.index,
  actionType: source.type,
  path
})

export const hasValidationErrors = (issues: readonly ValidationIssue[]) => issues.some(issue => issue.severity === 'error')
