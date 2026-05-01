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
import {
  createDataviewMutationPorts,
  type DataviewMutationPorts
} from '../program'
import {
  type DataviewCompileContext
} from './contracts'
import type {
  DataviewCompileReader
} from './reader'
import {
  createCompileReader
} from './reader'
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

const compileExternalBump = (
  input: DataviewCompileContext<
    Extract<Intent, { type: 'external.version.bump' }>,
    void
  >
) => {
  if (!string.isNonEmptyString(input.intent.source)) {
    input.issue({
      source: input.source,
      code: 'external.invalidSource',
      message: 'external.version.bump requires a non-empty source',
      path: 'source',
      severity: 'error'
    })
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
  DataviewCompileReader,
  void,
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
  'field.option.move': compileFieldIntent,
  'field.option.patch': compileFieldIntent,
  'field.option.remove': compileFieldIntent,
  'field.remove': compileFieldIntent,
  'view.create': (input) => {
    compileViewIntent(input)
  },
  'view.rename': (input) => {
    compileViewIntent(input)
  },
  'view.type.set': (input) => {
    compileViewIntent(input)
  },
  'view.search.set': (input) => {
    compileViewIntent(input)
  },
  'view.filter.create': (input) => {
    compileViewIntent(input)
  },
  'view.filter.patch': (input) => {
    compileViewIntent(input)
  },
  'view.filter.move': (input) => {
    compileViewIntent(input)
  },
  'view.filter.mode.set': (input) => {
    compileViewIntent(input)
  },
  'view.filter.remove': (input) => {
    compileViewIntent(input)
  },
  'view.filter.clear': (input) => {
    compileViewIntent(input)
  },
  'view.sort.create': (input) => {
    compileViewIntent(input)
  },
  'view.sort.patch': (input) => {
    compileViewIntent(input)
  },
  'view.sort.move': (input) => {
    compileViewIntent(input)
  },
  'view.sort.remove': (input) => {
    compileViewIntent(input)
  },
  'view.sort.clear': (input) => {
    compileViewIntent(input)
  },
  'view.group.set': (input) => {
    compileViewIntent(input)
  },
  'view.group.clear': (input) => {
    compileViewIntent(input)
  },
  'view.group.toggle': (input) => {
    compileViewIntent(input)
  },
  'view.group.mode.set': (input) => {
    compileViewIntent(input)
  },
  'view.group.sort.set': (input) => {
    compileViewIntent(input)
  },
  'view.group.interval.set': (input) => {
    compileViewIntent(input)
  },
  'view.group.showEmpty.set': (input) => {
    compileViewIntent(input)
  },
  'view.section.show': (input) => {
    compileViewIntent(input)
  },
  'view.section.hide': (input) => {
    compileViewIntent(input)
  },
  'view.section.collapse': (input) => {
    compileViewIntent(input)
  },
  'view.section.expand': (input) => {
    compileViewIntent(input)
  },
  'view.calc.set': (input) => {
    compileViewIntent(input)
  },
  'view.table.widths.set': (input) => {
    compileViewIntent(input)
  },
  'view.table.verticalLines.set': (input) => {
    compileViewIntent(input)
  },
  'view.table.wrap.set': (input) => {
    compileViewIntent(input)
  },
  'view.gallery.wrap.set': (input) => {
    compileViewIntent(input)
  },
  'view.gallery.size.set': (input) => {
    compileViewIntent(input)
  },
  'view.gallery.layout.set': (input) => {
    compileViewIntent(input)
  },
  'view.kanban.wrap.set': (input) => {
    compileViewIntent(input)
  },
  'view.kanban.size.set': (input) => {
    compileViewIntent(input)
  },
  'view.kanban.layout.set': (input) => {
    compileViewIntent(input)
  },
  'view.kanban.fillColor.set': (input) => {
    compileViewIntent(input)
  },
  'view.kanban.cardsPerColumn.set': (input) => {
    compileViewIntent(input)
  },
  'view.order.move': (input) => {
    compileViewIntent(input)
  },
  'view.order.splice': (input) => {
    compileViewIntent(input)
  },
  'view.display.move': (input) => {
    compileViewIntent(input)
  },
  'view.display.splice': (input) => {
    compileViewIntent(input)
  },
  'view.display.show': (input) => {
    compileViewIntent(input)
  },
  'view.display.hide': (input) => {
    compileViewIntent(input)
  },
  'view.display.clear': (input) => {
    compileViewIntent(input)
  },
  'view.open': (input) => {
    compileViewIntent(input)
  },
  'view.remove': (input) => {
    compileViewIntent(input)
  },
  'external.version.bump': compileExternalBump
}

export const compile = {
  createReader: createCompileReader,
  createProgram: createDataviewMutationPorts,
  handlers: dataviewIntentHandlers
} as const

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './contracts'
