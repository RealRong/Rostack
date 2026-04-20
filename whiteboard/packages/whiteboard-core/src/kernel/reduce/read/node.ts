import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import {
  getNode,
  isTopLevelNode
} from '@whiteboard/core/kernel/reduce/runtime'

export const createReadNodeApi = (
  tx: ReducerTx
) => ({
  get: (id: import('@whiteboard/core/types').NodeId) => getNode(tx._runtime.draft, id),
  require: (id: import('@whiteboard/core/types').NodeId) => {
    const node = getNode(tx._runtime.draft, id)
    if (!node) {
      throw new Error(`Node ${id} not found.`)
    }
    return node
  },
  isTopLevel: (id: import('@whiteboard/core/types').NodeId) => isTopLevelNode(
    tx._runtime.draft,
    getNode(tx._runtime.draft, id)
  ),
  record: (
    id: import('@whiteboard/core/types').NodeId,
    scope: import('@whiteboard/core/types').NodeRecordScope
  ) => {
    const node = getNode(tx._runtime.draft, id)
    return scope === 'data'
      ? node?.data
      : node?.style
  }
})
