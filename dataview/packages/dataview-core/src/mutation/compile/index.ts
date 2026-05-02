import type {
  MutationCompileDefinition
} from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from '../../types'
import {
  type DataviewCompileContext
} from './contracts'
import type {
  DataviewMutationReader,
  DataviewMutationWriter
} from '../model'
import {
  createCompileContext
} from './context'
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

type DataviewCompileExtras = Pick<DataviewCompileContext, 'query' | 'expect'>

export const compile: MutationCompileDefinition<
  DataviewCompileTable,
  DataDoc,
  DataviewMutationWriter,
  DataviewMutationReader,
  void,
  string,
  DataviewCompileExtras
> = {
  createContext: (input) => createCompileContext(input.reader, input),
  handlers: {
    ...dataviewRecordIntentHandlers,
    ...dataviewFieldIntentHandlers,
    ...dataviewViewIntentHandlers
  }
} as const

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './contracts'
