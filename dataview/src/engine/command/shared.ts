import type { EditTarget, Row } from '@dataview/core/contracts'
import { enumerateRecords } from '@dataview/core/document'

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

export const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export const uniqueRecordIds = (target: EditTarget): string[] => (
  target.type === 'record'
    ? [target.recordId]
    : Array.from(new Set(target.recordIds))
)

export const collectRecordIds = (records: Row[]) => {
  const recordIds: string[] = []
  enumerateRecords(records, entry => {
    recordIds.push(entry.record.id)
  })
  return recordIds
}

export const hasHierarchyPayload = (records: Row[]) => (
  records.some(record => {
    const rawRecord = record as Row & { children?: unknown; expanded?: unknown }
    return Array.isArray(rawRecord.children) || rawRecord.expanded !== undefined
  })
)
