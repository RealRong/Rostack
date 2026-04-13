import { buildSemanticDraft } from '@dataview/core/commit/semantics'
import type { Action, DataDoc } from '@dataview/core/contracts'
import type { DeltaItem } from '@dataview/core/contracts'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import { reduceOperations } from '@dataview/core/operation'
import { planWriteAction } from './plan'
import { hasValidationErrors, type ValidationIssue } from './issues'

export interface PlannedWriteBatch {
  operations: readonly BaseOperation[]
  deltaDraft: readonly DeltaItem[]
  issues: ValidationIssue[]
  canApply: boolean
}

export const planActions = (input: {
  document: DataDoc
  actions: readonly Action[]
}): PlannedWriteBatch => {
  // The write path plans directly to canonical operations for the single active runtime.
  const issues: ValidationIssue[] = []
  const operations: BaseOperation[] = []
  const deltaDraft: DeltaItem[] = []
  let workingDocument = input.document

  for (const [index, action] of input.actions.entries()) {
    const planned = planWriteAction(workingDocument, action, index)
    issues.push(...planned.issues)
    if (hasValidationErrors(planned.issues)) {
      return {
        operations: [],
        deltaDraft: [],
        issues,
        canApply: false
      }
    }

    if (!planned.operations.length) {
      continue
    }

    const nextDocument = reduceOperations(workingDocument, planned.operations)
    deltaDraft.push(...buildSemanticDraft({
      beforeDocument: workingDocument,
      afterDocument: nextDocument,
      operations: planned.operations
    }))
    operations.push(...planned.operations)
    workingDocument = nextDocument
  }

  return {
    operations,
    deltaDraft,
    issues,
    canApply: true
  }
}
export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './issues'
