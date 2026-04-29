import type { Intent } from '@dataview/core/types'
import type { DataDoc } from '@dataview/core/types'
import { string } from '@shared/core'
import type {
  MutationCompileHandlerTable
} from '@shared/mutation'
import type { DocumentOperation } from '@dataview/core/op'
import {
  createCompileReader,
  type DataviewCompileInput,
  issue
} from './internal/compile/base'
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

const runCompileIntent = (
  input: DataviewCompileInput,
  compile: (
    intent: Intent,
    input: DataviewCompileInput,
    reader: ReturnType<typeof createCompileReader>
  ) => unknown
) => {
  const result = compile(input.intent, input, createCompileReader(input))
  if (result !== undefined) {
    input.output(result)
  }
}

const compileExternalBump = (
  input: DataviewCompileInput<
    Extract<Intent, { type: 'external.version.bump' }>,
    void
  >
) => lowerExternalBump(input.intent, input)

export const dataviewIntentHandlers: MutationCompileHandlerTable<
  DataviewCompileTable,
  DataDoc,
  DocumentOperation,
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
  'field.option.setOrder': (input) => runCompileIntent(input, compileFieldIntent),
  'field.option.patch': (input) => runCompileIntent(input, compileFieldIntent),
  'field.option.remove': (input) => runCompileIntent(input, compileFieldIntent),
  'field.remove': (input) => runCompileIntent(input, compileFieldIntent),
  'view.create': (input) => runCompileIntent(input, compileViewIntent),
  'view.patch': (input) => runCompileIntent(input, compileViewIntent),
  'view.open': (input) => runCompileIntent(input, compileViewIntent),
  'view.remove': (input) => runCompileIntent(input, compileViewIntent),
  'external.version.bump': compileExternalBump
}

function lowerExternalBump(
  intent: Extract<Intent, { type: 'external.version.bump' }>,
  input: DataviewCompileInput
) {
  if (!string.isNonEmptyString(intent.source)) {
    issue(
      input,
      'external.invalidSource',
      'external.version.bump requires a non-empty source',
      'source'
    )
  }

  input.emit({
    type: 'external.version.bump',
    source: intent.source
  })
}
