import type { Action, DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
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
  operations: readonly DocumentOperation[]
  issues: ValidationIssue[]
  canApply: boolean
}

export const planActions = (input: {
  document: DataDoc
  actions: readonly Action[]
}): PlannedWriteBatch => {
  const issues: ValidationIssue[] = []
  const operations: DocumentOperation[] = []
  let workingDocument = input.document

  for (const [index, action] of input.actions.entries()) {
    const planned = planAction(workingDocument, action, index)
    issues.push(...planned.issues)
    if (hasValidationErrors(planned.issues)) {
      return {
        operations: [],
        issues,
        canApply: false
      }
    }

    if (!planned.operations.length) {
      continue
    }

    operations.push(...planned.operations)

    // Only advance planner state when later actions still depend on the mutated document.
    if (index < input.actions.length - 1) {
      workingDocument = reduceOperations(workingDocument, planned.operations)
    }
  }

  return {
    operations,
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
    case 'record.fields.writeMany':
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
