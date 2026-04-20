import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createEdgeLifecycleApi } from '@whiteboard/core/kernel/reduce/edge/lifecycle'
import { createEdgeFieldApi } from '@whiteboard/core/kernel/reduce/edge/field'
import { createEdgeRecordApi } from '@whiteboard/core/kernel/reduce/edge/record'

export const createEdgeApi = (
  tx: ReducerTx
) => ({
  lifecycle: createEdgeLifecycleApi(tx),
  field: createEdgeFieldApi(tx),
  record: createEdgeRecordApi(tx)
})
