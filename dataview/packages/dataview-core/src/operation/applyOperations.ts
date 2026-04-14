import type { CommitDelta } from '@dataview/core/contracts/delta'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import { type DeltaCollector, createDeltaCollector } from '@dataview/core/commit/collector'
import { reduceOperation } from '@dataview/core/operation/reducer'
import { buildInverseOperations } from '@dataview/core/operation/history/inverse'

export interface ApplyOperationsResult {
  document: DataDoc
  delta: CommitDelta
  undo: BaseOperation[]
  redo: BaseOperation[]
}

export const applyOperations = (document: DataDoc, operations: readonly BaseOperation[], collector?: DeltaCollector): ApplyOperationsResult => {
  const deltaCollector = collector ?? createDeltaCollector(document)
  let nextDocument = document
  const undoBatches: BaseOperation[][] = []
  const redo = [...operations]

  for (const operation of operations) {
    undoBatches.unshift(buildInverseOperations(nextDocument, operation))
    const beforeDocument = nextDocument
    nextDocument = reduceOperation(nextDocument, operation)
    deltaCollector.collect(beforeDocument, nextDocument, operation)
  }

  return {
    document: nextDocument,
    delta: deltaCollector.build(),
    undo: undoBatches.flat(),
    redo
  }
}
