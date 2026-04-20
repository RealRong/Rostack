import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createDirtyCanvasApi = (
  tx: ReducerTx
) => ({
  order: () => {
    tx._runtime.dirty.canvasOrder = true
  }
})
