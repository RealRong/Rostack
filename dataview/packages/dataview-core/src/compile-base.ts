import type {
  DataDoc,
  EditTarget,
  Intent,
  RecordId
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/op'
import type { MutationCompileHandlerInput } from '@shared/mutation'
import { string } from '@shared/core'
import {
  createDocumentReader,
  type DocumentReader
} from '@dataview/core/operations/internal/read'
import type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from '@dataview/core/operations/contracts'

export type DataviewCompileInput<
  TIntent extends Intent = Intent,
  TOutput = unknown
> = MutationCompileHandlerInput<
  DataDoc,
  TIntent,
  DocumentOperation,
  TOutput,
  void,
  ValidationCode
>

export const createCompileReader = (
  input: DataviewCompileInput
): DocumentReader => createDocumentReader(() => input.document)

export const emitMany = (
  input: DataviewCompileInput,
  ...operations: readonly DocumentOperation[]
): void => {
  operations.forEach((operation) => {
    input.emit(operation)
  })
}

export const pushIssue = (
  input: DataviewCompileInput,
  issue: ValidationIssue
): void => {
  input.issue({
    source: issue.source ?? input.source,
    code: issue.code,
    message: issue.message,
    path: issue.path,
    severity: issue.severity,
    details: issue.details
  })
}

export const issue = (
  input: DataviewCompileInput,
  code: ValidationCode,
  message: string,
  path?: string,
  severity: ValidationSeverity = 'error'
): void => {
  pushIssue(input, {
    source: input.source,
    code,
    message,
    path,
    severity
  })
}

export const reportIssues = (
  input: DataviewCompileInput,
  ...issues: readonly ValidationIssue[]
): void => {
  issues.forEach((nextIssue) => {
    pushIssue(input, nextIssue)
  })
}

export const requireValue = <T,>(
  input: DataviewCompileInput,
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
    input,
    requirement.code,
    requirement.message,
    requirement.path,
    requirement.severity ?? 'error'
  )
  return undefined
}

export const resolveTarget = (
  input: DataviewCompileInput,
  reader: DocumentReader,
  target: EditTarget,
  path = 'target'
): readonly RecordId[] | undefined => {
  if (target.type === 'record') {
    const record = reader.records.get(target.recordId)
    if (!record) {
      issue(
        input,
        'record.notFound',
        `Unknown record: ${target.recordId}`,
        `${path}.recordId`
      )
      return undefined
    }

    return [record.id]
  }

  const recordIds = Array.from(new Set(target.recordIds))
  if (!recordIds.length) {
    issue(
      input,
      'batch.emptyCollection',
      `${input.source.type} requires at least one item`,
      `${path}.recordIds`
    )
    return undefined
  }

  const resolved: RecordId[] = []
  recordIds.forEach((recordId, index) => {
    if (!string.isNonEmptyString(recordId) || !reader.records.has(recordId)) {
      issue(
        input,
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
