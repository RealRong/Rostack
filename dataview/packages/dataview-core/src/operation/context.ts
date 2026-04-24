import type { CommitImpact } from '@dataview/core/contracts/commit'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import {
  operationBuffer,
  type InverseBuilder
} from '@shared/core'
import {
  cowDraft,
  type Draft
} from '@shared/mutation'

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
  writeDocument(): DataDoc
  replaceDocument(document: DataDoc): DataDoc
  finish(): DocumentMutationResult
}

export const createDocumentMutationContext = (
  document: DataDoc,
  input: {
    impact?: CommitImpact
  } = {}
): DocumentMutationContext => {
  const createDraft = cowDraft.create<DataDoc>()
  let draft: Draft<DataDoc> = createDraft(document)
  const inverse = operationBuffer.createInverseBuilder<DocumentOperation>()
  const impact = input.impact ?? commitImpact.create()

  return {
    base: document,
    impact,
    inverse,
    document: () => draft.doc(),
    writeDocument: () => draft.write(),
    replaceDocument: (nextDocument) => {
      draft = createDraft(nextDocument)
      return draft.doc()
    },
    finish: () => {
      const nextDocument = draft.done()
      commitImpact.finalize(impact)
      return {
        document: nextDocument,
        impact,
        inverse: inverse.finish()
      }
    }
  }
}
