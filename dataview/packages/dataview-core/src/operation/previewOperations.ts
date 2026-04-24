import type { DataDoc } from '@dataview/core/contracts/state'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { applyDataviewOperation } from '@dataview/core/operation/definition'
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
    applyDataviewOperation({
      doc: () => draft.doc(),
      replace: (nextDocument) => {
        draft = createDraft(nextDocument)
      },
      inverse: {
        prependMany: () => {}
      },
      trace: impact
    }, operation)
  })

  return draft.done()
}
