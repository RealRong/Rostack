import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import {
  cloneCanvasSlot,
  cloneEdge,
  cloneMindmap,
  cloneMindmapMember,
  cloneNode
} from '@whiteboard/core/kernel/reduce/copy'
import {
  collectConnectedEdges,
  getMindmap,
  getMindmapTreeFromDraft,
  getNode,
  readCanvasOrder,
  readCanvasSlot
} from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapSnapshotApi = (
  tx: ReducerTx
) => ({
  capture: (id: import('@whiteboard/core/types').MindmapId) => {
    const mindmap = getMindmap(tx._runtime.draft, id)
    const tree = getMindmapTreeFromDraft(tx._runtime.draft, id)
    if (!mindmap || !tree) {
      throw new Error(`Mindmap ${id} not found.`)
    }
    const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, tree.rootNodeId))
    const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(tx._runtime.draft, nodeId)!))
    return {
      mindmap: cloneMindmap(mindmap),
      nodes,
      slot: cloneCanvasSlot(readCanvasSlot(readCanvasOrder(tx._runtime.draft), {
        kind: 'node',
        id: mindmap.root
      }))
    }
  },
  topic: (
    id: import('@whiteboard/core/types').MindmapId,
    rootId: import('@whiteboard/core/types').NodeId
  ) => {
    const current = getMindmap(tx._runtime.draft, id)
    const tree = getMindmapTreeFromDraft(tx._runtime.draft, id)
    if (!current || !tree) {
      throw new Error(`Mindmap ${id} not found.`)
    }
    const rootMember = current.members[rootId]
    const parentId = rootMember?.parentId
    if (!parentId) {
      throw new Error(`Topic ${rootId} parent missing.`)
    }
    const siblings = current.children[parentId] ?? []
    const index = siblings.indexOf(rootId)
    const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, rootId))
    const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(tx._runtime.draft, nodeId)!))
    const members = Object.fromEntries(
      [...nodeIds].map((nodeId) => [nodeId, cloneMindmapMember(current.members[nodeId])!])
    )
    const children = Object.fromEntries(
      [...nodeIds].map((nodeId) => [nodeId, [...(current.children[nodeId] ?? [])]])
    )
    return {
      root: rootId,
      slot: {
        parent: parentId,
        prev: index > 0 ? siblings[index - 1] : undefined,
        next: index >= 0 ? siblings[index + 1] : undefined
      },
      nodes,
      members,
      children
    }
  }
})
