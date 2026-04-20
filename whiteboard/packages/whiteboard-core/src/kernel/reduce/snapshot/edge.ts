import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { cloneEdge } from '@whiteboard/core/kernel/reduce/copy'
import { getEdge } from '@whiteboard/core/kernel/reduce/runtime'

export const createEdgeSnapshotApi = (
  tx: ReducerTx
) => ({
  capture: (id: import('@whiteboard/core/types').EdgeId) => {
    const edge = getEdge(tx._runtime.draft, id)
    if (!edge) {
      throw new Error(`Edge ${id} not found.`)
    }
    return cloneEdge(edge)
  }
})
