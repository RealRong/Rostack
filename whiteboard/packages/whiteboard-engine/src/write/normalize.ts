import type { KernelReduceResult } from '@whiteboard/core/kernel'
import type {
  Document,
  Operation,
  Origin,
  Size
} from '@whiteboard/core/types'
import {
  sanitizeOperations
} from '@whiteboard/engine/document/sanitize'
import {
  collectChanges,
  collectFinalizeOps,
} from '@whiteboard/engine/write/normalize/finalize'

type Reduce = (
  document: Document,
  operations: readonly Operation[],
  origin: Origin
) => KernelReduceResult

type WritePipeline = {
  run: (
    document: Document,
    operations: readonly Operation[],
    origin: Origin
  ) => KernelReduceResult
}

type Reduced = Extract<KernelReduceResult, { ok: true }>

export const createWritePipeline = ({
  reduce,
  nodeSize
}: {
  reduce: Reduce
  nodeSize: Size
}): WritePipeline => {
  const append = (
    document: Document,
    reduced: Reduced,
    operations: readonly Operation[],
    origin: Origin
  ): KernelReduceResult => (
    operations.length > 0
      ? reduce(
        document,
        [...reduced.data.changes.operations, ...operations],
        origin
      )
      : reduced
  )

  const deriveChanges = (
    beforeDocument: Document,
    reduced: Reduced
  ) => collectChanges({
    beforeDocument,
    afterDocument: reduced.data.doc,
    operations: reduced.data.changes.operations
  })

  const runFinalizeStep = (
    beforeDocument: Document,
    reduced: Reduced,
    origin: Origin
  ): KernelReduceResult => {
    const changes = deriveChanges(beforeDocument, reduced)
    const operations = collectFinalizeOps({
      afterDocument: reduced.data.doc,
      changes,
      nodeSize
    })

    return append(
      beforeDocument,
      reduced,
      operations,
      origin
    )
  }

  const run = (
    document: Document,
    operations: readonly Operation[],
    origin: Origin
  ): KernelReduceResult => {
    const sanitizedOperations = sanitizeOperations({
      document,
      operations
    })
    const base = reduce(document, sanitizedOperations, origin)
    if (!base.ok) return base

    const finalized = runFinalizeStep(document, base, origin)
    if (!finalized.ok) {
      return finalized
    }

    return finalized
  }

  return {
    run
  }
}
