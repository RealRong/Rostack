import type {
  EditTarget,
  DataDoc
} from '@dataview/core/contracts'
import {
  createIssue,
  type IssueSource,
  type ValidationIssue
} from '#engine/mutate/issues.ts'
import {
  validateRecordExists
} from '#engine/mutate/validate/entity.ts'

export const validateRequiredCollection = (
  source: IssueSource,
  items: readonly unknown[],
  path: string
): ValidationIssue[] => items.length
  ? []
  : [createIssue(
      source,
      'error',
      'batch.emptyCollection',
      `${source.type} requires at least one item`,
      path
    )]

export const validateRecordIdsExist = (
  document: DataDoc,
  source: IssueSource,
  recordIds: readonly string[],
  path = 'recordIds'
): ValidationIssue[] => recordIds.flatMap((recordId, index) => (
  validateRecordExists(document, source, recordId, `${path}.${index}`)
))

export const validateEditTarget = (
  document: DataDoc,
  source: IssueSource,
  target: EditTarget
): ValidationIssue[] => {
  if (target.type === 'record') {
    return validateRecordExists(
      document,
      source,
      target.recordId,
      'target.recordId'
    )
  }

  return [
    ...validateRequiredCollection(source, target.recordIds, 'target.recordIds'),
    ...validateRecordIdsExist(document, source, target.recordIds, 'target.recordIds')
  ]
}
