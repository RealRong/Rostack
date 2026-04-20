import { getSubtreeIds } from '@whiteboard/core/mindmap'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'
import {
  collectConnectedEdges,
  deleteEdge,
  deleteNode,
  getMindmap,
  getMindmapTreeFromDraft,
  setNode
} from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapStructureApi = (
  tx: ReducerTx
) => ({
  create: (input: {
    mindmap: import('@whiteboard/core/types').MindmapRecord
    nodes: readonly import('@whiteboard/core/types').Node[]
  }) => {
    tx._runtime.draft.mindmaps.set(input.mindmap.id, input.mindmap)
    markChange(tx._runtime.changes.mindmaps, 'add', input.mindmap.id)
    tx._runtime.inverse.unshift({
      type: 'mindmap.delete',
      id: input.mindmap.id
    })
    input.nodes.forEach((node) => {
      setNode(tx._runtime.draft, node)
      markChange(tx._runtime.changes.nodes, 'add', node.id)
      tx.dirty.node.value(node.id)
    })
    tx._runtime.changes.canvasOrder = true
    tx.dirty.canvas.order()
    tx.dirty.mindmap.layout(input.mindmap.id)
  },
  restore: (snapshot: {
    mindmap: import('@whiteboard/core/types').MindmapRecord
    nodes: readonly import('@whiteboard/core/types').Node[]
    slot?: import('@whiteboard/core/types').CanvasSlot
  }) => {
    tx._runtime.draft.mindmaps.set(snapshot.mindmap.id, snapshot.mindmap)
    snapshot.nodes.forEach((node) => {
      tx._runtime.draft.nodes.set(node.id, node)
      markChange(tx._runtime.changes.nodes, 'add', node.id)
      tx.dirty.node.value(node.id)
    })
    const rootId = snapshot.mindmap.root
    tx.collection.canvas.order().structure.insert({
      kind: 'node',
      id: rootId
    }, snapshot.slot?.prev
      ? { kind: 'after', itemId: `node:${snapshot.slot.prev.id}` }
      : snapshot.slot?.next
        ? { kind: 'before', itemId: `${snapshot.slot.next.kind}:${snapshot.slot.next.id}` }
        : { kind: 'end' })
    tx._runtime.inverse.unshift({
      type: 'mindmap.delete',
      id: snapshot.mindmap.id
    })
    markChange(tx._runtime.changes.mindmaps, 'add', snapshot.mindmap.id)
    tx.dirty.mindmap.layout(snapshot.mindmap.id)
  },
  delete: (id: import('@whiteboard/core/types').MindmapId) => {
    const mindmap = getMindmap(tx._runtime.draft, id)
    const tree = getMindmapTreeFromDraft(tx._runtime.draft, id)
    if (!mindmap || !tree) {
      return
    }
    const nodeIds = new Set(getSubtreeIds(tree, tree.rootNodeId))
    const connectedEdges = collectConnectedEdges(tx._runtime.draft, nodeIds)
    connectedEdges.forEach((edge) => {
      tx._runtime.inverse.unshift({
        type: 'edge.restore',
        edge: tx.snapshot.edge.capture(edge.id),
        slot: tx.snapshot.canvas.slot({
          kind: 'edge',
          id: edge.id
        })
      })
      deleteEdge(tx._runtime.draft, edge.id)
      markChange(tx._runtime.changes.edges, 'delete', edge.id)
      tx.dirty.edge.value(edge.id)
    })
    tx._runtime.inverse.unshift({
      type: 'mindmap.restore',
      snapshot: tx.snapshot.mindmap.capture(id)
    })
    nodeIds.forEach((nodeId) => {
      deleteNode(tx._runtime.draft, nodeId)
      markChange(tx._runtime.changes.nodes, 'delete', nodeId)
      tx.dirty.node.value(nodeId)
    })
    tx._runtime.draft.mindmaps.delete(id)
    markChange(tx._runtime.changes.mindmaps, 'delete', id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.canvas.order()
    tx.dirty.mindmap.value(id)
  }
})
