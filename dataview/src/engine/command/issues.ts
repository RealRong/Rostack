import type { GroupCommandType } from '@dataview/core/contracts/commands'
import type { IndexedCommand } from './context'

export type GroupValidationSeverity = 'error' | 'warning'

export type GroupValidationCode =
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

export interface GroupValidationIssue {
  severity: GroupValidationSeverity
  code: GroupValidationCode
  message: string
  commandIndex: number
  commandType: GroupCommandType
  path?: string
}

export const createIssue = (
  command: IndexedCommand,
  severity: GroupValidationSeverity,
  code: GroupValidationCode,
  message: string,
  path?: string
): GroupValidationIssue => ({
  severity,
  code,
  message,
  commandIndex: command.commandIndex,
  commandType: command.type,
  path
})

export const hasValidationErrors = (issues: readonly GroupValidationIssue[]) => issues.some(issue => issue.severity === 'error')
