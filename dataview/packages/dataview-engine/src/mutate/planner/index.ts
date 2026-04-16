import type { Action, DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import {
  insertDocumentRecords,
  patchDocumentCustomField,
  patchDocumentRecord,
  putDocumentCustomField,
  putDocumentView,
  removeDocumentCustomField,
  removeDocumentRecords,
  removeDocumentView,
  restoreDocumentRecordFieldsMany,
  setDocumentActiveViewId,
  writeDocumentRecordFieldsMany
} from '@dataview/core/document'
import { isNonEmptyString } from '@shared/core'
import { planFieldAction } from '@dataview/engine/mutate/planner/fields'
import {
  createIssue,
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

const applyPlannerOperation = (
  document: DataDoc,
  operation: DocumentOperation
): DataDoc => {
  switch (operation.type) {
    case 'document.record.insert':
      return insertDocumentRecords(document, operation.records, operation.target?.index)
    case 'document.record.patch':
      return patchDocumentRecord(document, operation.recordId, operation.patch)
    case 'document.record.remove':
      return removeDocumentRecords(document, operation.recordIds)
    case 'document.record.fields.writeMany':
      return writeDocumentRecordFieldsMany(document, operation)
    case 'document.record.fields.restoreMany':
      return restoreDocumentRecordFieldsMany(document, operation.entries)
    case 'document.view.put':
      return putDocumentView(document, operation.view)
    case 'document.activeView.set':
      return setDocumentActiveViewId(document, operation.viewId)
    case 'document.view.remove':
      return removeDocumentView(document, operation.viewId)
    case 'document.field.put':
      return putDocumentCustomField(document, operation.field)
    case 'document.field.patch':
      return patchDocumentCustomField(document, operation.fieldId, operation.patch)
    case 'document.field.remove':
      return removeDocumentCustomField(document, operation.fieldId)
    case 'external.version.bump':
      return document
    default: {
      const unexpectedOperation: never = operation
      throw new Error(`Unsupported planner operation: ${unexpectedOperation}`)
    }
  }
}

const applyPlannerOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DataDoc => {
  let nextDocument = document

  for (const operation of operations) {
    nextDocument = applyPlannerOperation(nextDocument, operation)
  }

  return nextDocument
}

export const planActions = (input: {
  document: DataDoc
  actions: readonly Action[]
}): PlannedWriteBatch => {
  const issues: ValidationIssue[] = []
  const operations: DocumentOperation[] = []
  let workingDocument = input.document

  for (const [index, action] of input.actions.entries()) {
    const planned = planAction(
      createPlannerScope({
        document: workingDocument,
        action,
        index
      }),
      action
    )
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
      workingDocument = applyPlannerOperations(workingDocument, planned.operations)
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
  scope: ReturnType<typeof createPlannerScope>,
  action: Extract<Action, { type: 'external.bumpVersion' }>
): PlannedActionResult => {
  if (!isNonEmptyString(action.source)) {
    scope.issue(
      'external.invalidSource',
      'external.bumpVersion requires a non-empty source',
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
    case 'field.convert':
    case 'field.duplicate':
    case 'field.option.create':
    case 'field.option.reorder':
    case 'field.option.update':
    case 'field.option.remove':
    case 'field.remove':
      return planFieldAction(scope, action)
    case 'view.create':
    case 'view.patch':
    case 'view.open':
    case 'view.remove':
      return planViewAction(scope, action)
    case 'external.bumpVersion':
      return lowerExternalBump(scope, action)
    default: {
      const unexpectedAction: never = action
      throw new Error(`Unsupported action: ${unexpectedAction}`)
    }
  }
}
