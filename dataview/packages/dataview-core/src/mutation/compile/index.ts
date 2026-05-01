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
import { dataviewFieldIntentHandlers } from './field'
import { dataviewRecordIntentHandlers } from './record'
import { dataviewViewIntentHandlers } from './view'
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
  ...dataviewRecordIntentHandlers,
  ...dataviewFieldIntentHandlers,
  ...dataviewViewIntentHandlers,
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
