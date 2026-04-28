import type { Intent } from '@dataview/core/types'
import type { DataDoc } from '@dataview/core/types'
import { string } from '@shared/core'
import type {
  MutationCompileCtx,
  MutationCompileHandlerTable
} from '@shared/mutation'
import type { DocumentOperation } from '@dataview/core/types/operations'
import {
  createCompileScope,
  type CompileScope
} from './internal/compile/scope'
import { compileFieldIntent } from './internal/compile/fields'
import { compileRecordIntent } from './internal/compile/records'
import { compileViewIntent } from './internal/compile/views'
import type {
  ValidationCode
} from './contracts'

type DataviewCompileTable = {
  [K in Intent['type']]: {
    intent: Extract<Intent, { type: K }>
    output: unknown
  }
}

export const dataviewIntentHandlers: MutationCompileHandlerTable<
  DataviewCompileTable,
  CompileScope,
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

export const createDataviewCompileScope = (input: {
  ctx: MutationCompileCtx<DataDoc, DocumentOperation, ValidationCode>
  doc: DataDoc
  intent: Intent
  index: number
}): CompileScope => createCompileScope({
  ctx: input.ctx,
  intent: input.intent,
  index: input.index
})

function lowerExternalBump(
  intent: Extract<Intent, { type: 'external.version.bump' }>,
  scope: CompileScope
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
