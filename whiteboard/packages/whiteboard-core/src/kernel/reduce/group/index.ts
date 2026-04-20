import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createGroupLifecycleApi } from '@whiteboard/core/kernel/reduce/group/lifecycle'
import { createGroupFieldApi } from '@whiteboard/core/kernel/reduce/group/field'

export const createGroupApi = (
  tx: ReducerTx
) => ({
  lifecycle: createGroupLifecycleApi(tx),
  field: createGroupFieldApi(tx)
})
