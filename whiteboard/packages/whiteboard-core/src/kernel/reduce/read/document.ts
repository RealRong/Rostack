import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createReadDocumentApi = (
  tx: ReducerTx
) => ({
  get: () => tx._runtime.draft.base,
  background: () => tx._runtime.draft.background
})
