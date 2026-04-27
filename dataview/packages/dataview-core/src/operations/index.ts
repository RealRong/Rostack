import { DATAVIEW_OPERATION_DEFINITIONS } from './definitions'
import {
  dataviewMutationOperations,
  spec as specAlias,
  reduceDataviewOperations,
  type DataviewOperationReduceExtra,
  type DataviewOperationReduceResult,
  type DataviewReduceContext
} from './spec'
import {
  compileIntents,
  compile,
  type CompiledIntentBatch,
  type ValidationCode,
  type ValidationIssue,
  type ValidationSeverity
} from './compile'
import { dataviewTrace, trace as traceAlias, type DataviewTrace } from './trace'
import {
  buildRecordCreateIntents,
  recordCreate,
  type BuildRecordCreateIntentsInput,
  type RecordCreateFilterRule
} from './plan'
import * as key from './key'
import * as issue from './issue'

export const definitions = DATAVIEW_OPERATION_DEFINITIONS
export const spec = specAlias
export const apply = reduceDataviewOperations
export { reduceDataviewOperations, compileIntents, compile, key, issue, dataviewTrace }
export { DATAVIEW_OPERATION_DEFINITIONS, dataviewMutationOperations, buildRecordCreateIntents, recordCreate }
export { traceAlias as trace }

export const operations = {
  definitions,
  spec,
  apply,
  compile,
  key,
  issue,
  trace: dataviewTrace,
  plan: {
    buildRecordCreateIntents,
    recordCreate
  }
} as const

export type {
  DataviewMutationKey
} from './key'
export type {
  DataviewTrace,
  DataviewOperationReduceExtra,
  DataviewOperationReduceResult,
  DataviewReduceContext,
  CompiledIntentBatch,
  ValidationCode,
  ValidationIssue,
  ValidationSeverity,
  BuildRecordCreateIntentsInput,
  RecordCreateFilterRule
}
export type {
  DocumentOperationDefinition
} from './definitions'
