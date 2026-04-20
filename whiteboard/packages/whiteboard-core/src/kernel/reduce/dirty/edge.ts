import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createDirtyEdgeApi = (
  tx: ReducerTx
) => ({
  geometry: (id: import('@whiteboard/core/types').EdgeId) => {
    tx._runtime.dirty.edges.add(id)
  },
  value: (id: import('@whiteboard/core/types').EdgeId) => {
    tx._runtime.dirty.edges.add(id)
  }
})
