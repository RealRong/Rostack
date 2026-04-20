import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'
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
    markChange(tx._runtime.changes.edges, 'add', edge.id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.edge.value(edge.id)
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
    markChange(tx._runtime.changes.edges, 'add', edge.id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.edge.value(edge.id)
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
    markChange(tx._runtime.changes.edges, 'delete', id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.edge.value(id)
    tx.dirty.canvas.order()
  }
})
