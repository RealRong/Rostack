import type { GroupCommand } from '@dataview/core/contracts/commands'
import type { GroupDocument } from '@dataview/core/contracts/state'
import { resolveCommand, type ResolvedCommand } from './commands'
import { indexCommand } from './context'
import { hasValidationErrors, type GroupValidationIssue } from './issues'
import { reduceOperations } from '@dataview/core/operation'

export interface ResolvedWriteBatch {
  operations: ResolvedCommand['operations']
  issues: GroupValidationIssue[]
  canApply: boolean
}

export interface ResolveWriteBatchOptions {
  document: GroupDocument
  commands: readonly GroupCommand[]
}

export const resolveWriteBatch = ({ document, commands }: ResolveWriteBatchOptions): ResolvedWriteBatch => {
  const issues: GroupValidationIssue[] = []
  const operations: ResolvedCommand['operations'] = []
  let workingDocument = document

  for (const [commandIndex, rawCommand] of commands.entries()) {
    const command = indexCommand(rawCommand as Extract<GroupCommand, { type: GroupCommand['type'] }>, commandIndex)
    const resolvedCommand = resolveCommand(workingDocument, command)
    issues.push(...resolvedCommand.issues)

    if (hasValidationErrors(resolvedCommand.issues)) {
      return {
        operations: [],
        issues,
        canApply: false
      }
    }

    operations.push(...resolvedCommand.operations)
    workingDocument = reduceOperations(workingDocument, resolvedCommand.operations)
  }

  return {
    operations,
    issues,
    canApply: true
  }
}
