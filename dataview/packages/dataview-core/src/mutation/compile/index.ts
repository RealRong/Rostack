import type {
  MutationCompileHandlerTable
} from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from '../../types'
import {
  createDataviewMutationWriter
} from '../writer'
import {
  type DataviewCompileContext
} from './contracts'
import type {
  DataviewQuery
} from '../query'
import type {
  DataviewMutationWriter
} from '../model'
import {
  createCompileReader
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

export const dataviewIntentHandlers: MutationCompileHandlerTable<
  DataviewCompileTable,
  DataDoc,
  DataviewMutationWriter,
  DataviewQuery,
  void,
  ValidationCode
> = {
  ...dataviewRecordIntentHandlers,
  ...dataviewFieldIntentHandlers,
  ...dataviewViewIntentHandlers
}

export const compile = {
  createReader: createCompileReader,
  createWriter: createDataviewMutationWriter,
  handlers: dataviewIntentHandlers
} as const

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './contracts'
