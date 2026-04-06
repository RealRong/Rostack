import type { Command } from '@dataview/core/contracts/commands'
import type { DataDoc } from '@dataview/core/contracts/state'
import { resolveCommand, type ResolvedCommand } from './commands'
import { indexCommand } from './context'
import { hasValidationErrors, type ValidationIssue } from './issues'
import { reduceOperations } from '@dataview/core/operation'

export interface ResolvedWriteBatch {
  operations: ResolvedCommand['operations']
  issues: ValidationIssue[]
  canApply: boolean
}

export interface ResolveWriteBatchOptions {
  document: DataDoc
  commands: readonly Command[]
}

export const resolveWriteBatch = ({ document, commands }: ResolveWriteBatchOptions): ResolvedWriteBatch => {
  const issues: ValidationIssue[] = []
  const operations: ResolvedCommand['operations'] = []
  let workingDocument = document

  for (const [commandIndex, rawCommand] of commands.entries()) {
    const command = indexCommand(rawCommand as Extract<Command, { type: Command['type'] }>, commandIndex)
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
