import type { GroupBaseOperation } from '@/core/contracts/operations'
import type { GroupDocument } from '@/core/contracts/state'
import { getDocumentRecordById, getDocumentRecords, getDocumentViews, normalizeViewOrders } from '@/core/document'
import type { IndexedCommand } from '../context'
import { createRecordId } from '../entityId'
import { createIssue, hasValidationErrors } from '../issues'
import {
  collectRecordIds,
  hasHierarchyPayload,
  hasRecord,
  resolveCommandResult,
  resolveEditTargetRecordIds,
  validateBatchItems,
  validateEditTarget
} from './shared'

const sameRecordOrder = (left: readonly string[], right: readonly string[]) => (
  left.length === right.length && left.every((recordId, index) => recordId === right[index])
)

const resolveDefaultRecordType = (document: GroupDocument) => {
  return getDocumentRecords(document).find(record => (
    typeof record.type === 'string' && record.type.length
  ))?.type
}

export const resolveRecordCreateCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'record.create' }>
) => {
  const explicitRecordId = command.input.id?.trim()
  const issues = [
    ...(command.input.id !== undefined && !explicitRecordId
      ? [createIssue(command, 'error', 'record.invalidId', 'Record id must be a non-empty string', 'input.id')]
      : []),
    ...(explicitRecordId && getDocumentRecordById(document, explicitRecordId)
      ? [createIssue(command, 'error', 'record.duplicateId', `Record already exists: ${explicitRecordId}`, 'input.id')]
      : [])
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const recordId = explicitRecordId || createRecordId()
  const record = {
    id: recordId,
    type: command.input.type ?? resolveDefaultRecordType(document),
    values: command.input.values ?? {},
    meta: command.input.meta
  }

  return resolveCommandResult(issues, [{
    type: 'document.record.insert',
    records: [record]
  }])
}

export const resolveRecordInsertCommand = (
  _document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'record.insertAt' }>
) => {
  const issues = validateBatchItems(command, command.records, 'records')
  if (hasHierarchyPayload(command.records)) {
    issues.push(createIssue(command, 'error', 'record.hierarchyUnsupported', 'Hierarchy payload is not supported in canonical records', 'records'))
  }

  const recordIds = collectRecordIds(command.records)
  const duplicateIds = recordIds.filter((recordId, index) => recordIds.indexOf(recordId) !== index)
  duplicateIds.forEach(recordId => {
    issues.push(createIssue(command, 'error', 'record.duplicateId', `Duplicate record id: ${recordId}`, 'records'))
  })

  if (command.target?.index !== undefined && command.target.index < 0) {
    issues.push(createIssue(command, 'error', 'record.invalidIndex', 'record.insertAt target index must be >= 0', 'target.index'))
  }

  return resolveCommandResult(issues, [
    {
      type: 'document.record.insert',
      records: command.records,
      target: command.target
    }
  ])
}

export const resolveRecordApplyCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'record.apply' }>
) => {
  const issues = validateEditTarget(document, command, command.target)
  if (!Object.keys(command.patch).length) {
    issues.push(createIssue(command, 'error', 'record.emptyPatch', 'record.apply patch cannot be empty', 'patch'))
  }
  if (command.patch.values && typeof command.patch.values !== 'object') {
    issues.push(createIssue(command, 'error', 'record.emptyPatch', 'record.apply values patch must be an object', 'patch.values'))
  }

  const operations = resolveEditTargetRecordIds(command.target).map(recordId => ({
    type: 'document.record.patch',
    recordId,
    patch: command.patch
  }) satisfies GroupBaseOperation)

  return resolveCommandResult(issues, operations)
}

export const resolveRecordRemoveCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'record.remove' }>
) => {
  const issues = validateBatchItems(command, command.recordIds, 'recordIds')
  command.recordIds.forEach((recordId, index) => {
    if (!hasRecord(document, recordId)) {
      issues.push(createIssue(command, 'error', 'record.notFound', `Unknown record: ${recordId}`, `recordIds.${index}`))
    }
  })

  const removedRecordIdSet = new Set(command.recordIds)
  const viewCleanupOperations = getDocumentViews(document).flatMap(view => {
    const nextOrders = normalizeViewOrders(document, view.orders.filter(recordId => !removedRecordIdSet.has(recordId)))
    return sameRecordOrder(nextOrders, view.orders)
      ? []
      : [{
          type: 'document.view.put',
          view: {
            ...view,
            orders: nextOrders
          }
        } satisfies GroupBaseOperation]
  })

  return resolveCommandResult(issues, [
    ...viewCleanupOperations,
    { type: 'document.record.remove', recordIds: command.recordIds }
  ])
}
