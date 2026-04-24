import type { DataDoc } from '@dataview/core/contracts/state'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { applyOperationMutation } from '@dataview/core/operation/mutation'
import {
  cowDraft,
  type Draft
} from '@shared/mutation'

export const previewOperations = (
  document: DataDoc,
  operations: readonly DocumentOperation[]
): DataDoc => {
  const createDraft = cowDraft.create<DataDoc>()
  let draft: Draft<DataDoc> = createDraft(document)
  const impact = commitImpact.create()

  operations.forEach((operation) => {
    applyOperationMutation({
      doc: () => draft.doc(),
      replace: (nextDocument) => {
        draft = createDraft(nextDocument)
      },
      inverse: {
        prependMany: () => {}
      }
    }, operation, impact)
  })

  return draft.done()
}
