import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { readCanvasOrder, readCanvasSlot } from '@whiteboard/core/kernel/reduce/runtime'
import { cloneCanvasSlot } from '@whiteboard/core/kernel/reduce/copy'

export const createCanvasSnapshotApi = (
  tx: ReducerTx
) => ({
  slot: (ref: import('@whiteboard/core/types').CanvasItemRef) =>
    cloneCanvasSlot(readCanvasSlot(readCanvasOrder(tx._runtime.draft), ref))
})
