import {
  META
} from '@dataview/core/operation/meta'
import {
  applyOperations
} from '@dataview/core/operation/applyOperations'
import {
  createDocumentMutationContext
} from '@dataview/core/operation/context'
import {
  reduceOperation,
  reduceOperations,
  previewOperations
} from '@dataview/core/operation/reducer'

export type {
  DocumentApplyResult
} from '@dataview/core/operation/applyOperations'
export type {
  DocumentMutationContext,
  DocumentMutationResult
} from '@dataview/core/operation/context'
export type {
  DocumentOperationFamily,
  DocumentOperationMeta,
  DocumentOperationMetaTable
} from '@dataview/core/operation/meta'
export {
  META
} from '@dataview/core/operation/meta'

export const operation = {
  meta: META,
  apply: applyOperations,
  createContext: createDocumentMutationContext,
  reduce: reduceOperation,
  reduceAll: reduceOperations,
  preview: previewOperations
} as const
