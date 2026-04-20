import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createDirtyNodeApi = (
  tx: ReducerTx
) => ({
  geometry: (id: import('@whiteboard/core/types').NodeId) => {
    tx._runtime.dirty.nodes.add(id)
  },
  value: (id: import('@whiteboard/core/types').NodeId) => {
    tx._runtime.dirty.nodes.add(id)
  }
})
