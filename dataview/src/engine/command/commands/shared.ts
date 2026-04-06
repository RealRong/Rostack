import type {
  CommandPayload,
  CommandType,
  EditTarget,
  ValueApplyAction
} from '@dataview/core/contracts/commands'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import type { DataDoc, Row } from '@dataview/core/contracts/state'
import { enumerateRecords, hasDocumentCustomField, hasDocumentRecord, hasDocumentView } from '@dataview/core/document'
import type { IndexedCommand } from '../context'
import { deriveIndexedCommand } from '../context'
import { createIssue, hasValidationErrors, type ValidationIssue } from '../issues'

export interface CommandResolution {
  issues: ValidationIssue[]
  operations: BaseOperation[]
}

export const resolveCommandResult = (
  issues: ValidationIssue[],
  operations: BaseOperation[] = []
): CommandResolution => ({
  issues,
  operations: hasValidationErrors(issues) ? [] : operations
})

export const deriveCommand = <TType extends CommandType>(
  command: IndexedCommand,
  type: TType,
  payload: CommandPayload<TType>
) => deriveIndexedCommand(command, type, payload)

export const hasRecord = (document: DataDoc, recordId: string) => hasDocumentRecord(document, recordId)
export const hasView = (document: DataDoc, viewId: string) => hasDocumentView(document, viewId)
export const hasCustomField = (document: DataDoc, fieldId: string) => hasDocumentCustomField(document, fieldId)
export const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export const resolveEditTargetRecordIds = (target: EditTarget) => {
  switch (target.type) {
    case 'record':
      return [target.recordId]
    case 'records':
      return Array.from(new Set(target.recordIds))
    default: {
      const unexpectedTarget: never = target
      throw new Error(`Unsupported edit target: ${unexpectedTarget}`)
    }
  }
}

export const collectRecordIds = (records: Row[]) => {
  const recordIds: string[] = []
  enumerateRecords(records, entry => {
    recordIds.push(entry.record.id)
  })
  return recordIds
}

export const hasHierarchyPayload = (records: Row[]) => {
  return records.some(record => {
    const rawRecord = record as Row & { children?: unknown; expanded?: unknown }
    return Array.isArray(rawRecord.children) || rawRecord.expanded !== undefined
  })
}

export const validateBatchItems = (command: IndexedCommand, items: readonly unknown[], path = 'items') => {
  if (items.length) {
    return []
  }
  return [createIssue(command, 'error', 'batch.emptyCollection', `${command.type} requires at least one item`, path)]
}

export const validateEditTarget = (document: DataDoc, command: IndexedCommand, target: EditTarget): ValidationIssue[] => {
  switch (target.type) {
    case 'record':
      return hasRecord(document, target.recordId)
        ? []
        : [createIssue(command, 'error', 'record.notFound', `Unknown record: ${target.recordId}`, 'target.recordId')]
    case 'records': {
      const issues = validateBatchItems(command, target.recordIds, 'target.recordIds')
      target.recordIds.forEach((recordId, index) => {
        if (!hasRecord(document, recordId)) {
          issues.push(createIssue(command, 'error', 'record.notFound', `Unknown record: ${recordId}`, `target.recordIds.${index}`))
        }
      })
      return issues
    }
    default: {
      const unexpectedTarget: never = target
      throw new Error(`Unsupported edit target: ${unexpectedTarget}`)
    }
  }
}

export const validateValueApplyAction = (command: IndexedCommand, action: ValueApplyAction): ValidationIssue[] => {
  switch (action.type) {
    case 'set':
    case 'clear':
      return isNonEmptyString(action.field)
        ? []
        : [createIssue(command, 'error', 'value.invalidField', `${command.type} requires a non-empty field`, 'action.field')]
    case 'patch':
      return Object.keys(action.patch).length
        ? []
        : [createIssue(command, 'error', 'value.emptyPatch', 'value.apply patch cannot be empty', 'action.patch')]
    default: {
      const unexpectedAction: never = action
      throw new Error(`Unsupported value.apply action: ${unexpectedAction}`)
    }
  }
}

export const validateViewExists = (document: DataDoc, command: IndexedCommand, viewId: string) => {
  return hasView(document, viewId) ? [] : [createIssue(command, 'error', 'view.notFound', `Unknown view: ${viewId}`, 'viewId')]
}

export const validateCustomFieldExists = (document: DataDoc, command: IndexedCommand, fieldId: string) => {
  return hasCustomField(document, fieldId) ? [] : [createIssue(command, 'error', 'field.notFound', `Unknown field: ${fieldId}`, 'fieldId')]
}
