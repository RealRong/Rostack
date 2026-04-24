import { changeSet } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { cloneCanvasSlot } from '@whiteboard/core/kernel/reduce/copy'
import {
  deleteNode,
  getNode,
  insertCanvasSlot,
  isTopLevelNode,
  readCanvasOrder,
  readCanvasSlot,
  setNode,
  writeCanvasOrder
} from '@whiteboard/core/kernel/reduce/runtime'

export const createNodeLifecycleApi = (
  tx: ReducerTx
) => ({
  create: (node: import('@whiteboard/core/types').Node) => {
    setNode(tx._runtime.draft, node)
    tx._runtime.inverse.unshift({
      type: 'node.delete',
      id: node.id
    })
    changeSet.markAdded(tx._runtime.changes.nodes, node.id)
    tx.dirty.node.value(node.id)
    if (isTopLevelNode(tx._runtime.draft, node)) {
      tx._runtime.changes.canvasOrder = true
      tx.dirty.canvas.order()
    }
  },
  restore: (
    node: import('@whiteboard/core/types').Node,
    slot?: import('@whiteboard/core/types').CanvasSlot
  ) => {
    tx._runtime.draft.nodes.set(node.id, node)
    if (isTopLevelNode(tx._runtime.draft, node)) {
      writeCanvasOrder(tx._runtime.draft, insertCanvasSlot(readCanvasOrder(tx._runtime.draft), {
        kind: 'node',
        id: node.id
      }, slot))
      tx._runtime.changes.canvasOrder = true
      tx.dirty.canvas.order()
    }
    tx._runtime.inverse.unshift({
      type: 'node.delete',
      id: node.id
    })
    changeSet.markAdded(tx._runtime.changes.nodes, node.id)
    tx.dirty.node.value(node.id)
  },
  delete: (id: import('@whiteboard/core/types').NodeId) => {
    const current = getNode(tx._runtime.draft, id)
    if (!current) {
      return
    }
    const slot = isTopLevelNode(tx._runtime.draft, current)
      ? readCanvasSlot(readCanvasOrder(tx._runtime.draft), { kind: 'node', id: current.id })
      : undefined
    tx._runtime.inverse.unshift({
      type: 'node.restore',
      node: tx.snapshot.node.capture(id),
      slot: cloneCanvasSlot(slot)
    })
    deleteNode(tx._runtime.draft, id)
    changeSet.markRemoved(tx._runtime.changes.nodes, id)
    tx.dirty.node.value(id)
    if (slot) {
      tx._runtime.changes.canvasOrder = true
      tx.dirty.canvas.order()
    }
  }
})
