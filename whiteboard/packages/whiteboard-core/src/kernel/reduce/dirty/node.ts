import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createDirtyNodeApi = (
  tx: ReducerTx
) => ({
  touch: (id: import('@whiteboard/core/types').NodeId) => {
    tx._runtime.dirty.nodes.add(id)
  }
})
