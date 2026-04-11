import type { Action, DataDoc } from '@dataview/core/contracts'
import type { DeltaItem } from '@dataview/core/contracts'
import { reduceOperations } from '@dataview/core/operation'
import { lowerAction } from '../action/lower'
import { hasValidationErrors, type ValidationIssue } from './issues'
import { runCommands, type ResolvedWriteBatch } from './runCommands'

export const resolveActionBatch = (input: {
  document: DataDoc
  actions: readonly Action[]
}): ResolvedWriteBatch => {
  const issues: ValidationIssue[] = []
  const operations: ResolvedWriteBatch['operations'] = []
  const deltaDraft: DeltaItem[] = []
  let workingDocument = input.document

  for (const [index, action] of input.actions.entries()) {
    const lowered = lowerAction(workingDocument, action, index)
    issues.push(...lowered.issues)
    if (hasValidationErrors(lowered.issues)) {
      return {
        operations: [],
        deltaDraft: [],
        issues,
        canApply: false
      }
    }

    const batch = runCommands({
      document: workingDocument,
      commands: lowered.commands
    })
    issues.push(...batch.issues)
    if (!batch.canApply) {
      return {
        operations: [],
        deltaDraft: [],
        issues,
        canApply: false
      }
    }

    const nextDocument = reduceOperations(workingDocument, batch.operations)
    deltaDraft.push(...batch.deltaDraft)
    operations.push(...batch.operations)
    workingDocument = nextDocument
  }

  return {
    operations,
    deltaDraft,
    issues,
    canApply: true
  }
}

export type { ResolvedWriteBatch } from './runCommands'
export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './issues'
