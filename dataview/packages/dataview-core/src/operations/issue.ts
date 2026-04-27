import type { IntentType } from '@dataview/core/types/intents'
export type ValidationSeverity =
  | 'error'
  | 'warning'

export type ValidationCode =
  | 'compile.applyFailed'
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
  type: IntentType
}

export interface ValidationIssue {
  severity: ValidationSeverity
  code: ValidationCode
  message: string
  path?: string
  details?: unknown
  source?: IssueSource
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
  path,
  source
})

export const hasValidationErrors = (
  issues: readonly ValidationIssue[]
): boolean => issues.some(issue => issue.severity === 'error')

export const create = createIssue
export const hasErrors = hasValidationErrors

export const issue = {
  create,
  hasErrors
} as const
