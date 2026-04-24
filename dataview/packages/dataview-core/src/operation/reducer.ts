import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import type { DocumentMutationContext } from '@dataview/core/operation/context'
import { createDocumentMutationContext } from '@dataview/core/operation/context'
import { reduceOperationMutation } from '@dataview/core/operation/mutation'

export const reduceOperation = (
  context: DocumentMutationContext,
  operation: DocumentOperation
): void => {
  reduceOperationMutation(context, operation)
}

export const reduceOperations = (
  context: DocumentMutationContext,
  operations: readonly DocumentOperation[]
): void => {
  for (const operation of operations) {
    reduceOperation(context, operation)
  }
}

export const previewOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DataDoc => {
  const context = createDocumentMutationContext(document)
  reduceOperations(context, operations)
  return context.finish().doc
}
