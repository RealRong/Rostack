import type { ActionType } from '@dataview/core/contracts/actions'
import type { CommandType } from '@dataview/core/contracts/commands'

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
  commandIndex: number
  commandType: ActionType | CommandType
  path?: string
}

export interface IssueSource {
  index: number
  type: ActionType | CommandType
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
  commandIndex: source.index,
  commandType: source.type,
  path
})

export const hasValidationErrors = (issues: readonly ValidationIssue[]) => issues.some(issue => issue.severity === 'error')
