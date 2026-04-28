import {
  dataviewIntentHandlers,
} from './compile'
import {
  dataviewEntities
} from './entities'
import {
  dataviewCustom
} from './mutation'
import {
  type ValidationCode,
  type ValidationIssue,
  type ValidationSeverity
} from './contracts'
import {
  buildRecordCreateIntents,
  recordCreate,
  type BuildRecordCreateIntentsInput,
  type RecordCreateFilterRule
} from './plan'

export const entities = dataviewEntities
export const compile = {
  handlers: dataviewIntentHandlers
} as const
export const custom = dataviewCustom

export {
  dataviewEntities,
  dataviewIntentHandlers,
  dataviewCustom,
  buildRecordCreateIntents,
  recordCreate
}

export const operations = {
  entities,
  compile,
  custom,
  plan: {
    buildRecordCreateIntents,
    recordCreate
  }
} as const

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity,
  BuildRecordCreateIntentsInput,
  RecordCreateFilterRule
}
