import type { DataDoc, Intent } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { operation } from '@dataview/core/operation'
import { compile } from '@shared/mutation'
import { string } from '@shared/core'
import { compileFieldIntent } from './fields'
import {
  hasValidationErrors,
  type ValidationIssue
} from '@dataview/core/mutation/issues'
import { compileRecordIntent } from './records'
import {
  createCompileScope,
  type CompiledIntentResult
} from './scope'
import { compileViewIntent } from './views'

export interface CompiledIntentBatch {
  ops: readonly DocumentOperation[]
  issues: ValidationIssue[]
  canApply: boolean
  outputs: readonly unknown[]
}

export const compileIntents = (input: {
  document: DataDoc
  intents: readonly Intent[]
}): CompiledIntentBatch => {
  const compiledIntents: CompiledIntentResult[] = []
  const result = compile<DataDoc, Intent, DocumentOperation>({
    doc: input.document,
    intents: input.intents,
    run: (ctx, intent, index) => {
      const compiled = compileIntent(
        createCompileScope({
          document: ctx.doc(),
          intent,
          index
        }),
        intent
      )

      compiledIntents.push(compiled)
      compiled.issues.forEach((issue) => {
        ctx.issue({
          code: issue.code,
          message: issue.message,
          path: issue.path,
          level: issue.severity
        })
      })

      if (!hasValidationErrors(compiled.issues) && compiled.operations.length) {
        ctx.emitMany(...compiled.operations)
      }
    },
    previewApply: (document, operations) => {
      return operation.preview(document, operations)
    },
    stopOnError: true
  })
  const issues = compiledIntents.flatMap((entry) => entry.issues)

  return {
    ops: result.ops,
    issues,
    canApply: !hasValidationErrors(issues),
    outputs: compiledIntents.map((entry) => entry.data)
  }
}
export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from '@dataview/core/mutation/issues'

const lowerExternalBump = (
  scope: ReturnType<typeof createCompileScope>,
  intent: Extract<Intent, { type: 'external.version.bump' }>
): CompiledIntentResult => {
  if (!string.isNonEmptyString(intent.source)) {
    scope.issue(
      'external.invalidSource',
      'external.version.bump requires a non-empty source',
      'source'
    )
  }

  return scope.finish({
    type: 'external.version.bump',
    source: intent.source
  })
}

const compileIntent = (
  scope: ReturnType<typeof createCompileScope>,
  intent: Intent
): CompiledIntentResult => {
  switch (intent.type) {
    case 'record.create':
    case 'record.patch':
    case 'record.remove':
    case 'record.fields.writeMany':
      return compileRecordIntent(scope, intent)
    case 'field.create':
    case 'field.patch':
    case 'field.replace':
    case 'field.setKind':
    case 'field.duplicate':
    case 'field.option.create':
    case 'field.option.setOrder':
    case 'field.option.patch':
    case 'field.option.remove':
    case 'field.remove':
      return compileFieldIntent(scope, intent)
    case 'view.create':
    case 'view.patch':
    case 'view.open':
    case 'view.remove':
      return compileViewIntent(scope, intent)
    case 'external.version.bump':
      return lowerExternalBump(scope, intent)
    default: {
      const unexpectedIntent: never = intent
      throw new Error(`Unsupported intent: ${unexpectedIntent}`)
    }
  }
}
