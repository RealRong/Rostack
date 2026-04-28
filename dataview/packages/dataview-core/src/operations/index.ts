import { DATAVIEW_OPERATION_DEFINITIONS } from './definitions'
import {
  dataviewOperationTable,
  dataviewReduceSpec,
  type DataviewOperationReduceExtra,
  type DataviewReduceContext
} from './spec'
import {
  dataviewIntentHandlers,
} from './compile'
import {
  type ValidationCode,
  type ValidationIssue,
  type ValidationSeverity
} from './contracts'
import {
  dataviewTraceSpec,
  dataviewTrace,
  type DataviewTrace
} from './trace'
import {
  buildRecordCreateIntents,
  recordCreate,
  type BuildRecordCreateIntentsInput,
  type RecordCreateFilterRule
} from './plan'

export const definitions = DATAVIEW_OPERATION_DEFINITIONS
export const table = dataviewOperationTable
export const reduce = dataviewReduceSpec
export const compile = {
  handlers: dataviewIntentHandlers
} as const

export {
  DATAVIEW_OPERATION_DEFINITIONS,
  dataviewOperationTable,
  dataviewReduceSpec,
  dataviewIntentHandlers,
  buildRecordCreateIntents,
  recordCreate,
  dataviewTrace
}
export { dataviewTraceSpec }
export const trace = dataviewTrace

export const operations = {
  definitions,
  table,
  reduce,
  compile,
  trace: dataviewTrace,
  plan: {
    buildRecordCreateIntents,
    recordCreate
  }
} as const

export type {
  DataviewTrace,
  DataviewOperationReduceExtra,
  DataviewReduceContext,
  ValidationCode,
  ValidationIssue,
  ValidationSeverity,
  BuildRecordCreateIntentsInput,
  RecordCreateFilterRule
}
export type {
  DocumentOperationDefinition
} from './definitions'
