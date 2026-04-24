import type { CommitImpact } from '@dataview/core/contracts/commit'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import {
  reduceOperationEffect
} from '@dataview/core/operation/mutation'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { apply } from '@shared/mutation'

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
  const result = apply<DataDoc, DocumentOperation, never, {
    impact: CommitImpact
  }, {
    impact: CommitImpact
  }>({
    doc: document,
    ops: operations,
    serializeKey: (_key: never) => '',
    model: {
      init: () => ({
        impact: commitImpact.create()
      }),
      step: (ctx, operation) => {
        const effect = reduceOperationEffect(
          ctx.doc(),
          operation,
          ctx.state.impact
        )
        ctx.replace(effect.document)
        ctx.inverse.prependMany(effect.inverse)
      },
      done: (ctx) => {
        commitImpact.finalize(ctx.state.impact)
        return {
          impact: ctx.state.impact
        }
      }
    }
  })

  return {
    document: result.doc,
    impact: result.extra.impact,
    undo: [...result.inverse],
    redo: [...result.forward]
  }
}
