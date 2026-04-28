import type { IntentType } from '@dataview/core/types/intents'
import {
  createCompileIssue,
  hasCompileErrors,
  type MutationCompileIssue,
  type MutationCompileSource
} from '@shared/mutation'
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

export type IssueSource = MutationCompileSource<IntentType>

export type ValidationIssue =
  MutationCompileIssue<ValidationCode, IntentType>

export const createIssue = (
  source: IssueSource,
  severity: ValidationSeverity,
  code: ValidationCode,
  message: string,
  path?: string,
  details?: unknown
): ValidationIssue => createCompileIssue(
  source,
  severity,
  code,
  message,
  path,
  details
)

export const hasValidationErrors = (
  issues: readonly ValidationIssue[]
): boolean => hasCompileErrors(issues)

export const create = createIssue
export const hasErrors = hasValidationErrors

export const issue = {
  create,
  hasErrors
} as const
