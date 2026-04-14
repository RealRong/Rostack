import { buildSemanticDraft } from '@dataview/core/commit/semantics'
import type { Action, DataDoc } from '@dataview/core/contracts'
import type { DeltaItem } from '@dataview/core/contracts'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import { reduceOperations } from '@dataview/core/operation'
import { isNonEmptyString } from '@shared/core'
import { planFieldAction } from '@dataview/engine/mutate/planner/fields'
import {
  createIssue,
  hasValidationErrors,
  type ValidationIssue
} from '@dataview/engine/mutate/issues'
import { planRecordAction } from '@dataview/engine/mutate/planner/records'
import {
  planResult,
  sourceOf,
  type PlannedActionResult
} from '@dataview/engine/mutate/planner/shared'
import { planViewAction } from '@dataview/engine/mutate/planner/views'

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
    const planned = planAction(workingDocument, action, index)
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
} from '@dataview/engine/mutate/issues'

const lowerExternalBump = (
  _document: DataDoc,
  action: Extract<Action, { type: 'external.bumpVersion' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = isNonEmptyString(action.source)
    ? []
    : [createIssue(source, 'error', 'external.invalidSource', 'external.bumpVersion requires a non-empty source', 'source')]

  return planResult(issues, [{
    type: 'external.version.bump',
    source: action.source
  }])
}

const planAction = (
  document: DataDoc,
  action: Action,
  index: number
): PlannedActionResult => {
  switch (action.type) {
    case 'record.create':
    case 'record.patch':
    case 'record.remove':
    case 'value.set':
    case 'value.patch':
    case 'value.clear':
      return planRecordAction(document, action, index)
    case 'field.create':
    case 'field.patch':
    case 'field.replace':
    case 'field.convert':
    case 'field.duplicate':
    case 'field.option.create':
    case 'field.option.reorder':
    case 'field.option.update':
    case 'field.option.remove':
    case 'field.remove':
      return planFieldAction(document, action, index)
    case 'view.create':
    case 'view.patch':
    case 'view.open':
    case 'view.remove':
      return planViewAction(document, action, index)
    case 'external.bumpVersion':
      return lowerExternalBump(document, action, index)
    default: {
      const unexpectedAction: never = action
      throw new Error(`Unsupported action: ${unexpectedAction}`)
    }
  }
}
