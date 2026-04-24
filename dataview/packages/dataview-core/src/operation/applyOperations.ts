import type { CommitImpact } from '@dataview/core/contracts/commit'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import {
  applyOperationMutation
} from '@dataview/core/operation/mutation'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { apply, type ApplyResult } from '@shared/mutation'

export type DocumentApplyResult = ApplyResult<
  DataDoc,
  DocumentOperation,
  never,
  {
    impact: CommitImpact
  }
>

export const applyOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DocumentApplyResult => apply<DataDoc, DocumentOperation, never, {
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
        applyOperationMutation(
          ctx,
          operation,
          ctx.state.impact
        )
      },
      done: (ctx) => {
        commitImpact.finalize(ctx.state.impact)
        return {
          impact: ctx.state.impact
        }
      }
    }
  })
