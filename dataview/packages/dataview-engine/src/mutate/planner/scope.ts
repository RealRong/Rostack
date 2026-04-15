import type {
  Action,
  DataDoc,
  EditTarget,
  RecordId
} from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { isNonEmptyString, unique } from '@shared/core'
import {
  createLiveDocumentReader,
  type DocumentReader
} from '@dataview/engine/document/reader'
import {
  createIssue,
  hasValidationErrors,
  type IssueSource,
  type ValidationCode,
  type ValidationIssue,
  type ValidationSeverity
} from '@dataview/engine/mutate/issues'

export interface PlannedActionResult {
  issues: ValidationIssue[]
  operations: DocumentOperation[]
}

export interface PlannerScope {
  readonly reader: DocumentReader
  readonly source: IssueSource
  issue(
    code: ValidationCode,
    message: string,
    path?: string,
    severity?: ValidationSeverity
  ): void
  report(...issues: readonly ValidationIssue[]): void
  require<T>(
    value: T | undefined,
    input: {
      code: ValidationCode
      message: string
      path?: string
      severity?: ValidationSeverity
    }
  ): T | undefined
  resolveTarget(
    target: EditTarget,
    path?: string
  ): readonly RecordId[] | undefined
  finish(...operations: readonly DocumentOperation[]): PlannedActionResult
}

export const createPlannerScope = (input: {
  document: DataDoc
  action: Action
  index: number
}): PlannerScope => {
  const issues: ValidationIssue[] = []
  const source: IssueSource = {
    index: input.index,
    type: input.action.type
  }
  const reader = createLiveDocumentReader(() => input.document)

  const issue = (
    code: ValidationCode,
    message: string,
    path?: string,
    severity: ValidationSeverity = 'error'
  ) => {
    issues.push(createIssue(source, severity, code, message, path))
  }

  const report = (...nextIssues: readonly ValidationIssue[]) => {
    issues.push(...nextIssues)
  }

  const requireValue = <T,>(
    value: T | undefined,
    requirement: {
      code: ValidationCode
      message: string
      path?: string
      severity?: ValidationSeverity
    }
  ): T | undefined => {
    if (value !== undefined) {
      return value
    }

    issue(
      requirement.code,
      requirement.message,
      requirement.path,
      requirement.severity
    )
    return undefined
  }

  const resolveTarget = (
    target: EditTarget,
    path = 'target'
  ): readonly RecordId[] | undefined => {
    if (target.type === 'record') {
      const record = requireValue(
        reader.records.get(target.recordId),
        {
          code: 'record.notFound',
          message: `Unknown record: ${target.recordId}`,
          path: `${path}.recordId`
        }
      )
      return record
        ? [record.id]
        : undefined
    }

    const recordIds = unique(target.recordIds) as RecordId[]
    if (!recordIds.length) {
      issue(
        'batch.emptyCollection',
        `${source.type} requires at least one item`,
        `${path}.recordIds`
      )
      return undefined
    }

    const resolved: RecordId[] = []
    recordIds.forEach((recordId, index) => {
      if (!isNonEmptyString(recordId) || !reader.records.has(recordId)) {
        issue(
          'record.notFound',
          `Unknown record: ${recordId}`,
          `${path}.recordIds.${index}`
        )
        return
      }

      resolved.push(recordId)
    })

    return resolved.length === recordIds.length
      ? resolved
      : undefined
  }

  const finish = (
    ...operations: readonly DocumentOperation[]
  ): PlannedActionResult => ({
    issues: [...issues],
    operations: hasValidationErrors(issues)
      ? []
      : [...operations]
  })

  return {
    reader,
    source,
    issue,
    report,
    require: requireValue,
    resolveTarget,
    finish
  }
}
