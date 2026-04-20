import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createDirtyMindmapApi = (
  tx: ReducerTx
) => ({
  layout: (id: import('@whiteboard/core/types').MindmapId) => {
    tx._runtime.dirty.mindmaps.add(id)
    tx.reconcile.mindmap.layout(id)
  },
  value: (id: import('@whiteboard/core/types').MindmapId) => {
    tx._runtime.dirty.mindmaps.add(id)
  }
})
