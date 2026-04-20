import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createDocumentLifecycleApi } from '@whiteboard/core/kernel/reduce/document/lifecycle'
import { createDocumentBackgroundApi } from '@whiteboard/core/kernel/reduce/document/background'

export const createDocumentApi = (
  tx: ReducerTx
) => ({
  lifecycle: createDocumentLifecycleApi(tx),
  background: createDocumentBackgroundApi(tx)
})
