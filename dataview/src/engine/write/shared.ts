import type { DataRecord, EditTarget } from '@dataview/core/contracts'
import { enumerateRecords } from '@dataview/core/document'
import { unique } from '@shared/core'

export interface CommandResult {
  issues: import('./issues').ValidationIssue[]
  operations: import('@dataview/core/contracts/operations').BaseOperation[]
}

export const commandResult = (
  issues: import('./issues').ValidationIssue[],
  operations: import('@dataview/core/contracts/operations').BaseOperation[] = []
): CommandResult => ({
  issues,
  operations
})

export const uniqueRecordIds = (target: EditTarget): string[] => (
  target.type === 'record'
    ? [target.recordId]
    : unique(target.recordIds)
)

export const collectRecordIds = (records: DataRecord[]) => {
  const recordIds: string[] = []
  enumerateRecords(records, entry => {
    recordIds.push(entry.record.id)
  })
  return recordIds
}

export const hasHierarchyPayload = (records: DataRecord[]) => (
  records.some(record => {
    const rawRecord = record as DataRecord & { children?: unknown; expanded?: unknown }
    return Array.isArray(rawRecord.children) || rawRecord.expanded !== undefined
  })
)
