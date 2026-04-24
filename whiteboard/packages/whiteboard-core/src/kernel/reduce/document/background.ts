import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { cloneBackground } from '@whiteboard/core/kernel/reduce/copy'

export const createDocumentBackgroundApi = (
  tx: ReducerTx
) => ({
  set: (background: import('@whiteboard/core/types').Document['background']) => {
    tx.inverse.prepend({
      type: 'document.background',
      background: cloneBackground(tx._runtime.draft.background)
    })
    tx._runtime.draft.background = background
    tx._runtime.changes.document = true
    tx._runtime.changes.background = true
    tx.dirty.document.touch()
    tx.dirty.document.background()
  }
})
