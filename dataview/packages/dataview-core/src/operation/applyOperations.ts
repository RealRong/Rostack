import type { CommitImpact } from '@dataview/core/contracts/commit'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import {
  createDocumentMutationContext
} from '@dataview/core/operation/context'
import {
  reduceOperations
} from '@dataview/core/operation/reducer'

export interface ApplyOperationsResult {
  document: DataDoc
  impact: CommitImpact
  undo: DocumentOperation[]
  redo: DocumentOperation[]
}

export const applyOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): ApplyOperationsResult => {
  const context = createDocumentMutationContext(document)
  reduceOperations(context, operations)
  const result = context.finish()

  return {
    document: result.document,
    impact: result.impact,
    undo: [...result.inverse],
    redo: [...operations]
  }
}
