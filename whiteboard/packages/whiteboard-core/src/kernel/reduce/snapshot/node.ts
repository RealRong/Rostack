import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { cloneNode } from '@whiteboard/core/kernel/reduce/copy'
import { getNode } from '@whiteboard/core/kernel/reduce/runtime'

export const createNodeSnapshotApi = (
  tx: ReducerTx
) => ({
  capture: (id: import('@whiteboard/core/types').NodeId) => {
    const node = getNode(tx._runtime.draft, id)
    if (!node) {
      throw new Error(`Node ${id} not found.`)
    }
    return cloneNode(node)
  }
})
