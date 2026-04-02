import type {
  GroupCommandPayload,
  GroupCommandType,
  GroupEditTarget,
  GroupValueApplyAction
} from '@/core/contracts/commands'
import type { GroupBaseOperation } from '@/core/contracts/operations'
import type { GroupDocument, GroupRecord } from '@/core/contracts/state'
import { enumerateRecords, hasDocumentProperty, hasDocumentRecord, hasDocumentView } from '@/core/document'
import type { IndexedCommand } from '../context'
import { deriveIndexedCommand } from '../context'
import { createIssue, hasValidationErrors, type GroupValidationIssue } from '../issues'

export interface CommandResolution {
  issues: GroupValidationIssue[]
  operations: GroupBaseOperation[]
}

export const resolveCommandResult = (
  issues: GroupValidationIssue[],
  operations: GroupBaseOperation[] = []
): CommandResolution => ({
  issues,
  operations: hasValidationErrors(issues) ? [] : operations
})

export const deriveCommand = <TType extends GroupCommandType>(
  command: IndexedCommand,
  type: TType,
  payload: GroupCommandPayload<TType>
) => deriveIndexedCommand(command, type, payload)

export const hasRecord = (document: GroupDocument, recordId: string) => hasDocumentRecord(document, recordId)
export const hasView = (document: GroupDocument, viewId: string) => hasDocumentView(document, viewId)
export const hasProperty = (document: GroupDocument, propertyId: string) => hasDocumentProperty(document, propertyId)
export const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export const resolveEditTargetRecordIds = (target: GroupEditTarget) => {
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

export const collectRecordIds = (records: GroupRecord[]) => {
  const recordIds: string[] = []
  enumerateRecords(records, entry => {
    recordIds.push(entry.record.id)
  })
  return recordIds
}

export const hasHierarchyPayload = (records: GroupRecord[]) => {
  return records.some(record => {
    const rawRecord = record as GroupRecord & { children?: unknown; expanded?: unknown }
    return Array.isArray(rawRecord.children) || rawRecord.expanded !== undefined
  })
}

export const validateBatchItems = (command: IndexedCommand, items: readonly unknown[], path = 'items') => {
  if (items.length) {
    return []
  }
  return [createIssue(command, 'error', 'batch.emptyCollection', `${command.type} requires at least one item`, path)]
}

export const validateEditTarget = (document: GroupDocument, command: IndexedCommand, target: GroupEditTarget): GroupValidationIssue[] => {
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

export const validateValueApplyAction = (command: IndexedCommand, action: GroupValueApplyAction): GroupValidationIssue[] => {
  switch (action.type) {
    case 'set':
    case 'clear':
      return isNonEmptyString(action.property)
        ? []
        : [createIssue(command, 'error', 'value.invalidField', `${command.type} requires a non-empty property`, 'action.property')]
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

export const validateViewExists = (document: GroupDocument, command: IndexedCommand, viewId: string) => {
  return hasView(document, viewId) ? [] : [createIssue(command, 'error', 'view.notFound', `Unknown view: ${viewId}`, 'viewId')]
}

export const validatePropertyExists = (document: GroupDocument, command: IndexedCommand, propertyId: string) => {
  return hasProperty(document, propertyId) ? [] : [createIssue(command, 'error', 'field.notFound', `Unknown property: ${propertyId}`, 'propertyId')]
}
