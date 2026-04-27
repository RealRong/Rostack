import type {
  DataDoc,
  EditTarget,
  Intent,
  RecordId
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import { collection, string } from '@shared/core'
import {
  createDocumentReader,
  type DocumentReader
} from '@dataview/core/operations/internal/read'
import {
  hasValidationErrors,
  type IssueSource,
  type ValidationCode,
  type ValidationIssue,
  type ValidationSeverity
} from '@dataview/core/operations/issue'

export interface CompiledIntentResult {
  issues: ValidationIssue[]
  operations: DocumentOperation[]
  data?: unknown
}

export interface CompileScope {
  readonly reader: DocumentReader
  readonly source: IssueSource
  emit(operation: DocumentOperation): void
  emitMany(...operations: readonly DocumentOperation[]): void
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
  finish(...operations: readonly DocumentOperation[]): CompiledIntentResult
}

export const createCompileScope = (input: {
  document: DataDoc
  intent: Intent
  index: number
}): CompileScope => {
  const source: IssueSource = {
    index: input.index,
    type: input.intent.type
  }
  const reader = createDocumentReader(() => input.document)
  const operations: DocumentOperation[] = []
  const issues: ValidationIssue[] = []

  const pushIssue = (
    issue: ValidationIssue
  ) => {
    issues.push({
      ...issue,
      source: issue.source ?? source
    })
  }

  const resolveTarget = (
    target: EditTarget,
    path = 'target'
  ): readonly RecordId[] | undefined => {
    if (target.type === 'record') {
      const record = reader.records.get(target.recordId)
      if (!record) {
        pushIssue({
          code: 'record.notFound',
          message: `Unknown record: ${target.recordId}`,
          path: `${path}.recordId`,
          severity: 'error'
        })
        return undefined
      }

      return [record.id]
    }

    const recordIds = collection.unique(target.recordIds) as RecordId[]
    if (!recordIds.length) {
      pushIssue({
        code: 'batch.emptyCollection',
        message: `${source.type} requires at least one item`,
        path: `${path}.recordIds`,
        severity: 'error'
      })
      return undefined
    }

    const resolved: RecordId[] = []
    recordIds.forEach((recordId, index) => {
      if (!string.isNonEmptyString(recordId) || !reader.records.has(recordId)) {
        pushIssue({
          code: 'record.notFound',
          message: `Unknown record: ${recordId}`,
          path: `${path}.recordIds.${index}`,
          severity: 'error'
        })
        return
      }

      resolved.push(recordId)
    })

    return resolved.length === recordIds.length
      ? resolved
      : undefined
  }

  const finish = (
    ...nextOperations: readonly DocumentOperation[]
  ): CompiledIntentResult => {
    if (nextOperations.length) {
      nextOperations.forEach((operation) => {
        pushOperation(operation)
      })
    }

    return {
      issues: [...issues],
      operations: hasValidationErrors(issues)
        ? []
        : [...operations]
    }
  }

  const pushOperation = (
    operation: DocumentOperation
  ) => {
    operations.push(operation)
  }
  return {
    reader,
    source,
    emit: (operation) => {
      pushOperation(operation)
    },
    emitMany: (...operations) => {
      operations.forEach((operation) => {
        pushOperation(operation)
      })
    },
    issue: (code, message, path, severity = 'error') => {
      pushIssue({
        code,
        message,
        path,
        severity
      })
    },
    report: (...issues) => {
      issues.forEach((issue) => {
        pushIssue(issue)
      })
    },
    require: (value, requirement) => {
      if (value !== undefined) {
        return value
      }

      pushIssue({
        code: requirement.code,
        message: requirement.message,
        path: requirement.path,
        severity: requirement.severity ?? 'error'
      })
      return undefined
    },
    resolveTarget,
    finish
  }
}
