import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  DocumentApplyResult
} from './spec'
import {
  dataviewReducer
} from './spec'

export const applyOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DocumentApplyResult => dataviewReducer.reduce({
  doc: document,
  ops: operations
})

export type {
  DocumentApplyResult
} from './spec'
