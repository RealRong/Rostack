import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { materializeDraftDocument } from '@whiteboard/core/kernel/reduce/runtime'
import { createDocumentReplaceResult } from '@whiteboard/core/kernel/reduce/commit'

export const createDocumentLifecycleApi = (
  tx: ReducerTx
) => ({
  replace: (document: import('@whiteboard/core/types').Document) => {
    tx._runtime.inverse.unshift({
      type: 'document.replace',
      document: materializeDraftDocument(tx._runtime.draft)
    })
    createDocumentReplaceResult(tx, document)
  }
})
