import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getEdge } from '@whiteboard/core/kernel/reduce/runtime'

export const createReadEdgeApi = (
  tx: ReducerTx
) => ({
  get: (id: import('@whiteboard/core/types').EdgeId) => getEdge(tx._runtime.draft, id),
  require: (id: import('@whiteboard/core/types').EdgeId) => {
    const edge = getEdge(tx._runtime.draft, id)
    if (!edge) {
      throw new Error(`Edge ${id} not found.`)
    }
    return edge
  },
  record: (
    id: import('@whiteboard/core/types').EdgeId,
    scope: import('@whiteboard/core/types').EdgeRecordScope
  ) => {
    const edge = getEdge(tx._runtime.draft, id)
    return scope === 'data'
      ? edge?.data
      : edge?.style
  }
})
