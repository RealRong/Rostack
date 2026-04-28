import type {
  DataDoc,
  EditTarget,
  Intent,
  RecordId
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import type { MutationCompileHandlerInput } from '@shared/mutation'
import { collection, string } from '@shared/core'
import {
  createDocumentReader,
  type DocumentReader
} from '@dataview/core/operations/internal/read'
import {
  type IssueSource,
  type ValidationCode,
  type ValidationIssue,
  type ValidationSeverity
} from '@dataview/core/operations/contracts'

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
}

export const createCompileScope = <
  TIntent extends Intent = Intent,
  TOutput = unknown
>(input: {
  controls: MutationCompileHandlerInput<
    DataDoc,
    TIntent,
    DocumentOperation,
    TOutput,
    void,
    ValidationCode
  >
}): CompileScope => {
  const source: IssueSource = input.controls.source
  const reader = createDocumentReader(() => input.controls.document)

  const pushIssue = (
    issue: ValidationIssue
  ) => {
    const normalized = {
      ...issue,
      source: issue.source ?? source
    }
    input.controls.issue({
      source: normalized.source,
      code: normalized.code,
      message: normalized.message,
      path: normalized.path,
      severity: normalized.severity,
      details: normalized.details
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

  const pushOperation = (
    operation: DocumentOperation
  ) => {
    input.controls.emit(operation)
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
    resolveTarget
  }
}
