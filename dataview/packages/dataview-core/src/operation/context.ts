import type { CommitImpact } from '@dataview/core/contracts/commit'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { mutationContext, type InverseBuilder } from '@shared/core'

export interface DocumentMutationResult {
  document: DataDoc
  impact: CommitImpact
  inverse: readonly DocumentOperation[]
}

export interface DocumentMutationContext {
  readonly base: DataDoc
  readonly impact: CommitImpact
  readonly inverse: InverseBuilder<DocumentOperation>
  document(): DataDoc
  replaceDocument(document: DataDoc): DataDoc
  finish(): DocumentMutationResult
}

export const createDocumentMutationContext = (
  document: DataDoc,
  input: {
    impact?: CommitImpact
  } = {}
): DocumentMutationContext => {
  const context = mutationContext.createMutationContext<
    DataDoc,
    DataDoc,
    DocumentOperation,
    {
      impact: CommitImpact
    }
  >({
    base: document,
    working: {
      impact: input.impact ?? commitImpact.create()
    }
  })

  return {
    base: context.base,
    impact: context.working.impact,
    inverse: context.inverse,
    document: () => context.current(),
    replaceDocument: (nextDocument) => context.replace(nextDocument),
    finish: () => {
      const result = context.finish()
      commitImpact.finalize(result.working.impact)
      return {
        document: result.current,
        impact: result.working.impact,
        inverse: result.inverse
      }
    }
  }
}
