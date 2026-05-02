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

type DataviewCompileExtras = Pick<DataviewCompileContext, 'query' | 'expect'>

export const dataviewCompileHandlers = {
  ...dataviewRecordIntentHandlers,
  ...dataviewFieldIntentHandlers,
  ...dataviewViewIntentHandlers
} as const

export const compile: MutationCompileDefinition<
  Intent,
  DataDoc,
  DataviewMutationWriter,
  DataviewMutationReader,
  void,
  string,
  DataviewCompileExtras,
  typeof dataviewCompileHandlers
> = {
  createContext: (input) => createCompileContext(input.reader, input),
  handlers: dataviewCompileHandlers
} as const

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './contracts'
