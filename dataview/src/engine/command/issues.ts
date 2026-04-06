import type { CommandType } from '@dataview/core/contracts/commands'
import type { IndexedCommand } from './context'

export type ValidationSeverity = 'error' | 'warning'

export type ValidationCode =
  | 'batch.emptyCollection'
  | 'record.notFound'
  | 'record.duplicateId'
  | 'record.invalidId'
  | 'record.emptyCollection'
  | 'record.hierarchyUnsupported'
  | 'record.invalidIndex'
  | 'record.emptyPatch'
  | 'view.notFound'
  | 'view.invalid'
  | 'view.invalidProjection'
  | 'view.invalidOrder'
  | 'view.manualOrderUnavailable'
  | 'field.notFound'
  | 'field.invalid'
  | 'value.emptyMatrix'
  | 'value.invalidAnchor'
  | 'value.invalidField'
  | 'value.emptyPatch'
  | 'external.invalidSource'

export interface ValidationIssue {
  severity: ValidationSeverity
  code: ValidationCode
  message: string
  commandIndex: number
  commandType: CommandType
  path?: string
}

export const createIssue = (
  command: IndexedCommand,
  severity: ValidationSeverity,
  code: ValidationCode,
  message: string,
  path?: string
): ValidationIssue => ({
  severity,
  code,
  message,
  commandIndex: command.commandIndex,
  commandType: command.type,
  path
})

export const hasValidationErrors = (issues: readonly ValidationIssue[]) => issues.some(issue => issue.severity === 'error')
