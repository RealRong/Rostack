import type { Action, DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { operation } from '@dataview/core/operation'
import { compile } from '@shared/mutation'
import { string } from '@shared/core'
import { planFieldAction } from '@dataview/engine/mutate/planner/fields'
import {
  hasValidationErrors,
  type ValidationIssue
} from '@dataview/engine/mutate/issues'
import { planRecordAction } from '@dataview/engine/mutate/planner/records'
import {
  createPlannerScope,
  type PlannedActionResult
} from '@dataview/engine/mutate/planner/scope'
import { planViewAction } from '@dataview/engine/mutate/planner/views'

export interface PlannedWriteBatch {
  operations: readonly DocumentOperation[]
  issues: ValidationIssue[]
  canApply: boolean
  planMs?: number
}

export const planActions = (input: {
  document: DataDoc
  actions: readonly Action[]
}): PlannedWriteBatch => {
  const plannedActions: PlannedActionResult[] = []
  const result = compile<DataDoc, Action, DocumentOperation>({
    doc: input.document,
    intents: input.actions,
    run: (ctx, action, index) => {
      const planned = planAction(
        createPlannerScope({
          document: ctx.doc(),
          action,
          index
        }),
        action
      )

      plannedActions.push(planned)
      planned.issues.forEach((issue) => {
        ctx.issue({
          code: issue.code,
          message: issue.message,
          path: issue.path,
          level: issue.severity
        })
      })

      if (!hasValidationErrors(planned.issues) && planned.operations.length) {
        ctx.emitMany(...planned.operations)
      }
    },
    previewApply: (document, operations) => {
      return operation.preview(document, operations)
    },
    stopOnError: true
  })
  const issues = plannedActions.flatMap((entry) => entry.issues)

  return {
    operations: result.ops,
    issues,
    canApply: !hasValidationErrors(issues)
  }
}
export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from '@dataview/engine/mutate/issues'

const lowerExternalBump = (
  scope: ReturnType<typeof createPlannerScope>,
  action: Extract<Action, { type: 'external.version.bump' }>
): PlannedActionResult => {
  if (!string.isNonEmptyString(action.source)) {
    scope.issue(
      'external.invalidSource',
      'external.version.bump requires a non-empty source',
      'source'
    )
  }

  return scope.finish({
    type: 'external.version.bump',
    source: action.source
  })
}

const planAction = (
  scope: ReturnType<typeof createPlannerScope>,
  action: Action
): PlannedActionResult => {
  switch (action.type) {
    case 'record.create':
    case 'record.patch':
    case 'record.remove':
    case 'record.fields.writeMany':
      return planRecordAction(scope, action)
    case 'field.create':
    case 'field.patch':
    case 'field.replace':
    case 'field.setKind':
    case 'field.duplicate':
    case 'field.option.create':
    case 'field.option.setOrder':
    case 'field.option.patch':
    case 'field.option.remove':
    case 'field.remove':
      return planFieldAction(scope, action)
    case 'view.create':
    case 'view.patch':
    case 'view.open':
    case 'view.remove':
      return planViewAction(scope, action)
    case 'external.version.bump':
      return lowerExternalBump(scope, action)
    default: {
      const unexpectedAction: never = action
      throw new Error(`Unsupported action: ${unexpectedAction}`)
    }
  }
}
