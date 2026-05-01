import {
  string
} from '@shared/core'
import type {
  MutationCompileHandlerTable
} from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from '../../types'
import type {
  DocumentReader
} from '../../document/reader'
import {
  type DataviewMutationPorts
} from '../program'
import {
  issue,
  type DataviewCompileContext
} from './base'
import { compileFieldIntent } from './field'
import { compileRecordIntent } from './record'
import { compileViewIntent } from './view'
import type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './contracts'

type DataviewCompileTable = {
  [K in Intent['type']]: {
    intent: Extract<Intent, { type: K }>
    output: unknown
  }
}

const runCompileIntent = (
  input: DataviewCompileContext,
  compileIntent: (
    input: DataviewCompileContext
  ) => unknown
) => {
  const result = compileIntent(input)
  if (result !== undefined) {
    input.output(result)
  }
}

const compileExternalBump = (
  input: DataviewCompileContext<
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

  input.program.signal({
    changes: {
      'external.version': true
    }
  })
}

export const dataviewIntentHandlers: MutationCompileHandlerTable<
  DataviewCompileTable,
  DataDoc,
  DataviewMutationPorts,
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
  'view.rename': (input) => runCompileIntent(input, compileViewIntent),
  'view.type.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.search.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.filter.create': (input) => runCompileIntent(input, compileViewIntent),
  'view.filter.patch': (input) => runCompileIntent(input, compileViewIntent),
  'view.filter.move': (input) => runCompileIntent(input, compileViewIntent),
  'view.filter.mode.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.filter.remove': (input) => runCompileIntent(input, compileViewIntent),
  'view.filter.clear': (input) => runCompileIntent(input, compileViewIntent),
  'view.sort.create': (input) => runCompileIntent(input, compileViewIntent),
  'view.sort.patch': (input) => runCompileIntent(input, compileViewIntent),
  'view.sort.move': (input) => runCompileIntent(input, compileViewIntent),
  'view.sort.remove': (input) => runCompileIntent(input, compileViewIntent),
  'view.sort.clear': (input) => runCompileIntent(input, compileViewIntent),
  'view.group.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.group.clear': (input) => runCompileIntent(input, compileViewIntent),
  'view.group.toggle': (input) => runCompileIntent(input, compileViewIntent),
  'view.group.mode.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.group.sort.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.group.interval.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.group.showEmpty.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.section.show': (input) => runCompileIntent(input, compileViewIntent),
  'view.section.hide': (input) => runCompileIntent(input, compileViewIntent),
  'view.section.collapse': (input) => runCompileIntent(input, compileViewIntent),
  'view.section.expand': (input) => runCompileIntent(input, compileViewIntent),
  'view.calc.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.table.widths.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.table.verticalLines.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.table.wrap.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.gallery.wrap.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.gallery.size.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.gallery.layout.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.kanban.wrap.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.kanban.size.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.kanban.layout.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.kanban.fillColor.set': (input) => runCompileIntent(input, compileViewIntent),
  'view.kanban.cardsPerColumn.set': (input) => runCompileIntent(input, compileViewIntent),
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
} from './contracts'
