import type { DataDoc, Intent } from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import type {
  MutationCompileHandlerTable
} from '@shared/mutation'
import {
  compileMutationIntents,
  OperationMutationRuntime
} from '@shared/mutation'
import { string } from '@shared/core'
import { spec } from './spec'
import {
  createIssue,
  hasValidationErrors,
  type IssueSource,
  type ValidationCode,
  type ValidationIssue,
  type ValidationSeverity
} from './issue'
import { compileFieldIntent } from './internal/compile/fields'
import { compileRecordIntent } from './internal/compile/records'
import {
  createCompileScope
} from './internal/compile/scope'
import { compileViewIntent } from './internal/compile/views'

export interface CompiledIntentBatch {
  ops: readonly DocumentOperation[]
  issues: ValidationIssue[]
  canApply: boolean
  outputs: readonly unknown[]
}

type DataviewCompileTable = {
  [K in Intent['type']]: {
    intent: Extract<Intent, { type: K }>
    output: unknown
  }
}

const handlers: MutationCompileHandlerTable<
  DataviewCompileTable,
  ReturnType<typeof createCompileScope>,
  ValidationCode
> = {
  'record.create': compileRecordIntent,
  'record.patch': compileRecordIntent,
  'record.remove': compileRecordIntent,
  'record.fields.writeMany': compileRecordIntent,
  'field.create': compileFieldIntent,
  'field.patch': compileFieldIntent,
  'field.replace': compileFieldIntent,
  'field.setKind': compileFieldIntent,
  'field.duplicate': compileFieldIntent,
  'field.option.create': compileFieldIntent,
  'field.option.setOrder': compileFieldIntent,
  'field.option.patch': compileFieldIntent,
  'field.option.remove': compileFieldIntent,
  'field.remove': compileFieldIntent,
  'view.create': compileViewIntent,
  'view.patch': compileViewIntent,
  'view.open': compileViewIntent,
  'view.remove': compileViewIntent,
  'external.version.bump': lowerExternalBump
}

export const compileIntents = (input: {
  document: DataDoc
  intents: readonly Intent[]
}): CompiledIntentBatch => {
  const issues: ValidationIssue[] = []
  let lastSource: IssueSource | undefined
  const result = compileMutationIntents<
    DataDoc,
    DataviewCompileTable,
    DocumentOperation,
    ReturnType<typeof createCompileScope>,
    ValidationCode
  >({
    doc: input.document,
    intents: input.intents,
    handlers,
    createContext: ({
      ctx,
      intent,
      index
    }) => {
      lastSource = {
        index,
        type: intent.type
      }
      return createCompileScope({
        ctx,
        intent,
        index,
        issues
      })
    },
    apply: ({
      doc,
      ops
    }) => {
      const applied = OperationMutationRuntime.reduce({
        doc,
        ops,
        operations: spec
      })
      return applied.ok
        ? {
            ok: true as const,
            doc: applied.doc
          }
        : {
            ok: false as const,
            issue: {
              code: 'compile.applyFailed',
              message: applied.error.message,
              details: applied.error.details,
              severity: 'error'
            }
          }
    }
  })

  const issueKeys = new Set(
    issues.map((issue) => JSON.stringify([
      issue.severity,
      issue.code,
      issue.message,
      issue.path,
      issue.source?.index,
      issue.source?.type
    ]))
  )

  result.issues?.forEach((issue) => {
    if (
      issues.some((entry) => (
        entry.code === issue.code
        && entry.message === issue.message
        && entry.path === issue.path
        && entry.severity === issue.severity
      ))
    ) {
      return
    }

    const normalized = createIssue(
      lastSource ?? {
        index: 0,
        type: 'external.version.bump'
      },
      'error',
      'compile.applyFailed',
      issue.message,
      issue.path
    )
    const key = JSON.stringify([
      normalized.severity,
      normalized.code,
      normalized.message,
      normalized.path,
      normalized.source?.index,
      normalized.source?.type
    ])
    if (issueKeys.has(key)) {
      return
    }

    issues.push(normalized)
    issueKeys.add(key)
  })

  return {
    ops: result.ops,
    issues,
    canApply: !hasValidationErrors(issues),
    outputs: result.outputs
  }
}

export const compile = compileIntents
export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
}

function lowerExternalBump(
  intent: Extract<Intent, { type: 'external.version.bump' }>,
  scope: ReturnType<typeof createCompileScope>
) {
  if (!string.isNonEmptyString(intent.source)) {
    scope.issue(
      'external.invalidSource',
      'external.version.bump requires a non-empty source',
      'source'
    )
  }

  scope.emit({
    type: 'external.version.bump',
    source: intent.source
  })
}
