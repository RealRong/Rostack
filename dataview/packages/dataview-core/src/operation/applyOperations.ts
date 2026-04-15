import type { CommitImpact } from '@dataview/core/contracts/commit'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import {
  createCommitImpact,
  finalizeCommitImpact
} from '@dataview/core/commit/impact'
import {
  executeOperation
} from '@dataview/core/operation/executeOperation'

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
  let nextDocument = document
  const undo: DocumentOperation[] = []
  const impact = createCommitImpact()

  for (const operation of operations) {
    const executed = executeOperation(nextDocument, operation, impact)
    nextDocument = executed.document
    if (executed.inverse.length) {
      undo.unshift(...executed.inverse)
    }
  }

  finalizeCommitImpact(impact)

  return {
    document: nextDocument,
    impact,
    undo,
    redo: [...operations]
  }
}
