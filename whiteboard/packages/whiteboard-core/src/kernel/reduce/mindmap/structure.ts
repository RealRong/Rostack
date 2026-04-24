import { changeSet } from '@shared/core'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import {
  collectConnectedEdges,
  deleteMindmap,
  deleteEdge,
  deleteNode,
  getMindmap,
  getMindmapTreeFromDraft,
  setMindmap,
  setNode
} from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapStructureApi = (
  tx: ReducerTx
) => ({
  create: (input: {
    mindmap: import('@whiteboard/core/types').MindmapRecord
    nodes: readonly import('@whiteboard/core/types').Node[]
  }) => {
    setMindmap(tx._runtime.draft, input.mindmap)
    changeSet.markAdded(tx._runtime.changes.mindmaps, input.mindmap.id)
    tx.inverse.prepend({
      type: 'mindmap.delete',
      id: input.mindmap.id
    })
    input.nodes.forEach((node) => {
      setNode(tx._runtime.draft, node)
      changeSet.markAdded(tx._runtime.changes.nodes, node.id)
      tx.dirty.node.touch(node.id)
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
      changeSet.markAdded(tx._runtime.changes.nodes, node.id)
      tx.dirty.node.touch(node.id)
    })
    tx.collection.canvas.order().structure.insert({
      kind: 'mindmap',
      id: snapshot.mindmap.id
    }, snapshot.slot?.prev
      ? { kind: 'after', itemId: `${snapshot.slot.prev.kind}:${snapshot.slot.prev.id}` }
      : snapshot.slot?.next
        ? { kind: 'before', itemId: `${snapshot.slot.next.kind}:${snapshot.slot.next.id}` }
        : { kind: 'end' })
    tx.inverse.prepend({
      type: 'mindmap.delete',
      id: snapshot.mindmap.id
    })
    changeSet.markAdded(tx._runtime.changes.mindmaps, snapshot.mindmap.id)
    tx.dirty.mindmap.layout(snapshot.mindmap.id)
  },
  delete: (id: import('@whiteboard/core/types').MindmapId) => {
    const mindmap = getMindmap(tx._runtime.draft, id)
    const tree = getMindmapTreeFromDraft(tx._runtime.draft, id)
    if (!mindmap || !tree) {
      return
    }
    const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, tree.rootNodeId))
    const connectedEdges = collectConnectedEdges(tx._runtime.draft, nodeIds)
    connectedEdges.forEach((edge) => {
      tx.inverse.prepend({
        type: 'edge.restore',
        edge: tx.snapshot.edge.capture(edge.id),
        slot: tx.snapshot.canvas.slot({
          kind: 'edge',
          id: edge.id
        })
      })
      deleteEdge(tx._runtime.draft, edge.id)
      changeSet.markRemoved(tx._runtime.changes.edges, edge.id)
      tx.dirty.edge.touch(edge.id)
    })
    tx.inverse.prepend({
      type: 'mindmap.restore',
      snapshot: tx.snapshot.mindmap.capture(id)
    })
    nodeIds.forEach((nodeId) => {
      deleteNode(tx._runtime.draft, nodeId)
      changeSet.markRemoved(tx._runtime.changes.nodes, nodeId)
      tx.dirty.node.touch(nodeId)
    })
    deleteMindmap(tx._runtime.draft, id)
    changeSet.markRemoved(tx._runtime.changes.mindmaps, id)
    tx._runtime.changes.canvasOrder = true
    tx.dirty.canvas.order()
    tx.dirty.mindmap.touch(id)
  }
})
