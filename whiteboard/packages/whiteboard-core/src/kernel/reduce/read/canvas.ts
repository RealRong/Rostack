import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { readCanvasOrder } from '@whiteboard/core/kernel/reduce/runtime'

export const createReadCanvasApi = (
  tx: ReducerTx
) => ({
  order: () => readCanvasOrder(tx._runtime.draft)
})
