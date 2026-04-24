import {
  applyOperations
} from '@dataview/core/operation/applyOperations'
import {
  createDocumentMutationContext
} from '@dataview/core/operation/context'
import {
  reduceDocumentOperation,
  reduceDocumentOperations,
  reduceOperation,
  reduceOperations
} from '@dataview/core/operation/reducer'

export type {
  ApplyOperationsResult
} from '@dataview/core/operation/applyOperations'
export type {
  DocumentMutationContext,
  DocumentMutationResult
} from '@dataview/core/operation/context'

export const operation = {
  apply: applyOperations,
  createContext: createDocumentMutationContext,
  reduce: {
    one: reduceOperation,
    all: reduceOperations,
    document: {
      one: reduceDocumentOperation,
      all: reduceDocumentOperations
    }
  }
} as const
