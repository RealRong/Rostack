import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createDirtyDocumentApi = (
  tx: ReducerTx
) => ({
  value: () => {
    tx._runtime.dirty.document = true
  },
  background: () => {
    tx._runtime.dirty.background = true
  }
})
