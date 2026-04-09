import type { Command } from '@dataview/core/contracts/commands'
import type { DeltaItem } from '@dataview/core/contracts'
import type { DataDoc } from '@dataview/core/contracts/state'
import { buildSemanticDraft } from '@dataview/core/commit/semantics'
import { resolveCommand, type ResolvedCommand } from './commands'
import { indexCommand } from './context'
import { hasValidationErrors, type ValidationIssue } from './issues'
import { reduceOperations } from '@dataview/core/operation'

export interface ResolvedWriteBatch {
  operations: ResolvedCommand['operations']
  deltaDraft: readonly DeltaItem[]
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
  const deltaDraft: DeltaItem[] = []
  let workingDocument = document

  for (const [commandIndex, rawCommand] of commands.entries()) {
    const command = indexCommand(rawCommand as Extract<Command, { type: Command['type'] }>, commandIndex)
    const resolvedCommand = resolveCommand(workingDocument, command)
    issues.push(...resolvedCommand.issues)

    if (hasValidationErrors(resolvedCommand.issues)) {
      return {
        operations: [],
        deltaDraft: [],
        issues,
        canApply: false
      }
    }

    const nextDocument = reduceOperations(workingDocument, resolvedCommand.operations)
    deltaDraft.push(...buildSemanticDraft({
      beforeDocument: workingDocument,
      afterDocument: nextDocument,
      operations: resolvedCommand.operations
    }))
    operations.push(...resolvedCommand.operations)
    workingDocument = nextDocument
  }

  return {
    operations,
    deltaDraft,
    issues,
    canApply: true
  }
}
