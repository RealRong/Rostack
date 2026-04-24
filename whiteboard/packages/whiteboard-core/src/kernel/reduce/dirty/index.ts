import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createDirtyApi = (
  tx: ReducerTx
) => ({
  document: {
    touch: () => {
      tx._runtime.dirty.document = true
    },
    background: () => {
      tx._runtime.dirty.background = true
    }
  },
  canvas: {
    order: () => {
      tx._runtime.dirty.canvasOrder = true
    }
  },
  node: {
    touch: (id: import('@whiteboard/core/types').NodeId) => {
      tx._runtime.dirty.nodes.add(id)
    }
  },
  edge: {
    touch: (id: import('@whiteboard/core/types').EdgeId) => {
      tx._runtime.dirty.edges.add(id)
    }
  },
  group: {
    touch: (id: import('@whiteboard/core/types').GroupId) => {
      tx._runtime.dirty.groups.add(id)
    }
  },
  mindmap: {
    layout: (id: import('@whiteboard/core/types').MindmapId) => {
      tx._runtime.dirty.mindmaps.add(id)
      tx.reconcile.mindmap.layout(id)
    },
    touch: (id: import('@whiteboard/core/types').MindmapId) => {
      tx._runtime.dirty.mindmaps.add(id)
    }
  }
})
