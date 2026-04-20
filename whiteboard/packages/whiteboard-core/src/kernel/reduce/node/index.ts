import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createNodeLifecycleApi } from '@whiteboard/core/kernel/reduce/node/lifecycle'
import { createNodeFieldApi } from '@whiteboard/core/kernel/reduce/node/field'
import { createNodeRecordApi } from '@whiteboard/core/kernel/reduce/node/record'

export const createNodeApi = (
  tx: ReducerTx
) => ({
  lifecycle: createNodeLifecycleApi(tx),
  field: createNodeFieldApi(tx),
  record: createNodeRecordApi(tx)
})
