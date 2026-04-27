import type {
  DataDoc,
  EditTarget,
  Intent,
  RecordId
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import { collection, string } from '@shared/core'
import { planningContext } from '@shared/mutation'
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
  const context = planningContext.createPlanningContext<
    DocumentReader,
    DocumentOperation,
    ValidationCode,
    IssueSource
  >({
    read: createDocumentReader(() => input.document),
    source
  })
  const reader = context.read

  const resolveTarget = (
    target: EditTarget,
    path = 'target'
  ): readonly RecordId[] | undefined => {
    if (target.type === 'record') {
      const record = context.require(
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

    const recordIds = collection.unique(target.recordIds) as RecordId[]
    if (!recordIds.length) {
      context.issue({
        code: 'batch.emptyCollection',
        message: `${source.type} requires at least one item`,
        path: `${path}.recordIds`
      })
      return undefined
    }

    const resolved: RecordId[] = []
    recordIds.forEach((recordId, index) => {
      if (!string.isNonEmptyString(recordId) || !reader.records.has(recordId)) {
        context.issue({
          code: 'record.notFound',
          message: `Unknown record: ${recordId}`,
          path: `${path}.recordIds.${index}`
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
    ...operations: readonly DocumentOperation[]
  ): CompiledIntentResult => {
    context.emitMany(operations)
    const result = context.finish()
    return {
      issues: [...result.issues],
      operations: hasValidationErrors(result.issues)
        ? []
        : [...result.operations]
    }
  }

  return {
    reader,
    source,
    emit: (operation) => {
      context.emit(operation)
    },
    emitMany: (...operations) => {
      context.emitMany(operations)
    },
    issue: (code, message, path, severity = 'error') => {
      context.issue({
        code,
        message,
        path,
        severity
      })
    },
    report: (...issues) => {
      context.report(...issues)
    },
    require: (value, requirement) => context.require(value, requirement),
    resolveTarget,
    finish
  }
}
