import type { CommitDelta } from '#core/contracts/delta.ts'
import type { BaseOperation } from '#core/contracts/operations.ts'
import type { DataDoc } from '#core/contracts/state.ts'
import { type DeltaCollector, createDeltaCollector } from '#core/commit/collector.ts'
import { reduceOperation } from '#core/operation/reducer.ts'
import { buildInverseOperations } from '#core/operation/history/inverse.ts'

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
