import {
  string
} from '@shared/core'
import type {
  MutationCompileHandlerTable
} from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from './types'
import type {
  DocumentOperation
} from './op'
import type {
  DocumentReader
} from './document/reader'
import {
  issue,
  type DataviewCompileInput
} from './compile-base'
import { compileFieldIntent } from './compile-field'
import { compileRecordIntent } from './compile-record'
import { compileViewIntent } from './compile-view'
import type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './compile-contracts'

type DataviewCompileTable = {
  [K in Intent['type']]: {
    intent: Extract<Intent, { type: K }>
    output: unknown
  }
}

const runCompileIntent = (
  input: DataviewCompileInput,
  compileIntent: (
    intent: Intent,
    input: DataviewCompileInput,
    reader: DocumentReader
  ) => unknown
) => {
  const result = compileIntent(input.intent, input, input.reader)
  if (result !== undefined) {
    input.output(result)
  }
}

const compileExternalBump = (
  input: DataviewCompileInput<
    Extract<Intent, { type: 'external.version.bump' }>,
    void
  >
) => {
  if (!string.isNonEmptyString(input.intent.source)) {
    issue(
      input,
      'external.invalidSource',
      'external.version.bump requires a non-empty source',
      'source'
    )
  }

  input.emit({
    type: 'external.version.bump',
    source: input.intent.source
  })
}

export const dataviewIntentHandlers: MutationCompileHandlerTable<
  DataviewCompileTable,
  DataDoc,
  DocumentOperation,
  DocumentReader,
  void,
  ValidationCode
> = {
  'record.create': (input) => runCompileIntent(input, compileRecordIntent),
  'record.patch': (input) => runCompileIntent(input, compileRecordIntent),
  'record.remove': (input) => runCompileIntent(input, compileRecordIntent),
  'record.fields.writeMany': (input) => runCompileIntent(input, compileRecordIntent),
  'field.create': (input) => runCompileIntent(input, compileFieldIntent),
  'field.patch': (input) => runCompileIntent(input, compileFieldIntent),
  'field.replace': (input) => runCompileIntent(input, compileFieldIntent),
  'field.setKind': (input) => runCompileIntent(input, compileFieldIntent),
  'field.duplicate': (input) => runCompileIntent(input, compileFieldIntent),
  'field.option.create': (input) => runCompileIntent(input, compileFieldIntent),
  'field.option.move': (input) => runCompileIntent(input, compileFieldIntent),
  'field.option.patch': (input) => runCompileIntent(input, compileFieldIntent),
  'field.option.remove': (input) => runCompileIntent(input, compileFieldIntent),
  'field.remove': (input) => runCompileIntent(input, compileFieldIntent),
  'view.create': (input) => runCompileIntent(input, compileViewIntent),
  'view.patch': (input) => runCompileIntent(input, compileViewIntent),
  'view.order.move': (input) => runCompileIntent(input, compileViewIntent),
  'view.order.splice': (input) => runCompileIntent(input, compileViewIntent),
  'view.display.move': (input) => runCompileIntent(input, compileViewIntent),
  'view.display.splice': (input) => runCompileIntent(input, compileViewIntent),
  'view.display.show': (input) => runCompileIntent(input, compileViewIntent),
  'view.display.hide': (input) => runCompileIntent(input, compileViewIntent),
  'view.display.clear': (input) => runCompileIntent(input, compileViewIntent),
  'view.open': (input) => runCompileIntent(input, compileViewIntent),
  'view.remove': (input) => runCompileIntent(input, compileViewIntent),
  'external.version.bump': compileExternalBump
}

export const compile = {
  handlers: dataviewIntentHandlers
} as const

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './compile-contracts'
