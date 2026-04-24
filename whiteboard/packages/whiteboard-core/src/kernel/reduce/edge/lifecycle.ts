import { changeSet } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import {
  deleteEdge,
  getEdge,
  insertCanvasSlot,
  readCanvasOrder,
  readCanvasSlot,
  setEdge,
  writeCanvasOrder
} from '@whiteboard/core/kernel/reduce/runtime'

export const createEdgeLifecycleApi = (
  tx: ReducerTx
) => ({
  create: (edge: import('@whiteboard/core/types').Edge) => {
    setEdge(tx._runtime.draft, edge)
    tx._runtime.inverse.unshift({
      type: 'edge.delete',
      id: edge.id
    })
    changeSet.markAdded(tx._runtime.changes.edges, edge.id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.edge.touch(edge.id)
    tx.dirty.canvas.order()
  },
  restore: (
    edge: import('@whiteboard/core/types').Edge,
    slot?: import('@whiteboard/core/types').CanvasSlot
  ) => {
    tx._runtime.draft.edges.set(edge.id, edge)
    writeCanvasOrder(tx._runtime.draft, insertCanvasSlot(readCanvasOrder(tx._runtime.draft), {
      kind: 'edge',
      id: edge.id
    }, slot))
    tx._runtime.inverse.unshift({
      type: 'edge.delete',
      id: edge.id
    })
    changeSet.markAdded(tx._runtime.changes.edges, edge.id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.edge.touch(edge.id)
    tx.dirty.canvas.order()
  },
  delete: (id: import('@whiteboard/core/types').EdgeId) => {
    const current = getEdge(tx._runtime.draft, id)
    if (!current) {
      return
    }
    tx._runtime.inverse.unshift({
      type: 'edge.restore',
      edge: tx.snapshot.edge.capture(id),
      slot: tx.snapshot.canvas.slot({
        kind: 'edge',
        id
      })
    })
    deleteEdge(tx._runtime.draft, id)
    changeSet.markRemoved(tx._runtime.changes.edges, id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.edge.touch(id)
    tx.dirty.canvas.order()
  }
})
