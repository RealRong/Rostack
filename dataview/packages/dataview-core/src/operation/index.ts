import {
  applyOperations
} from '@dataview/core/operation/applyOperations'
import {
  executeOperation
} from '@dataview/core/operation/executeOperation'
import {
  reduceOperation,
  reduceOperations
} from '@dataview/core/operation/reducer'

export type {
  ApplyOperationsResult
} from '@dataview/core/operation/applyOperations'
export type {
  ExecuteOperationResult
} from '@dataview/core/operation/executeOperation'

export const operation = {
  apply: applyOperations,
  exec: executeOperation,
  reduce: {
    one: reduceOperation,
    all: reduceOperations
  }
} as const
