import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type { MindmapItem } from '@whiteboard/engine/types/projection'
import type { Node, NodeId, SpatialNode } from '@whiteboard/core/types'
import type { BoardConfig } from '@whiteboard/engine/types/instance'
import {
  computeMindmapLayout,
  getMindmapTree,
  getSubtreeIds,
  resolveMindmapRender
} from '@whiteboard/core/mindmap'
import type { ReadSnapshot } from '@whiteboard/engine/types/internal/read'
import { createProjectionRuntime } from '@whiteboard/engine/read/store/projection'

type MindmapProjectionState = {
  entryById: Map<NodeId, MindmapItem>
  ids: readonly NodeId[]
  visibleNodesRef?: readonly Node[]
  allNodesRef?: readonly Node[]
}

type MindmapProjectionUpdate = {
  nextState: MindmapProjectionState
  idsChanged: boolean
  changedTreeIds: Set<NodeId>
}

const isSameIds = (left: readonly NodeId[], right: readonly NodeId[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export const createMindmapProjection = (
  initialSnapshot: ReadSnapshot,
  deps: {
    config: BoardConfig
  }
) => {
  const config = deps.config
  const projection = createProjectionRuntime<NodeId, MindmapItem | undefined>({
    initialList: [],
    emptyValue: undefined,
    read: (treeId) => {
      ensureSynced()
      return state.entryById.get(treeId)
    }
  })
  let snapshotRef: ReadSnapshot = initialSnapshot
  let state: MindmapProjectionState = {
    entryById: new Map<NodeId, MindmapItem>(),
    ids: []
  }

  const buildTree = (
    root: SpatialNode,
    tree: MindmapItem['tree']
  ): MindmapItem => {
    const allNodeById = snapshotRef.model.canvas.nodeById
    const childNodeIds = getSubtreeIds(tree, tree.rootNodeId)
    const computed = computeMindmapLayout(
      tree,
      (nodeId) => {
        const node = allNodeById.get(nodeId)
        return {
          width: Math.max(node?.size?.width ?? config.mindmapNodeSize.width, 1),
          height: Math.max(node?.size?.height ?? config.mindmapNodeSize.height, 1)
        }
      },
      tree.layout
    )
    const render = resolveMindmapRender({
      tree,
      computed
    })

    return {
      id: root.id,
      node: root,
      tree,
      layout: tree.layout,
      computed,
      shiftX: -computed.bbox.x,
      shiftY: -computed.bbox.y,
      childNodeIds,
      connectors: render.connectors
    }
  }

  const commitState = (nextState: MindmapProjectionState) => {
    state = nextState
  }

  const reconcile = (
    current: MindmapProjectionState
  ): MindmapProjectionUpdate => {
    const visibleNodes = snapshotRef.model.nodes.visible
    const allNodes = snapshotRef.model.nodes.all
    if (visibleNodes === current.visibleNodesRef && allNodes === current.allNodesRef) {
      return {
        nextState: current,
        idsChanged: false,
        changedTreeIds: new Set<NodeId>()
      }
    }

    const roots = visibleNodes.filter(
      (node): node is SpatialNode & { type: 'mindmap' } => node.type === 'mindmap'
    )
    const previousIds = current.ids
    const previousById = current.entryById
    const nextById = new Map<NodeId, MindmapItem>()
    const nextIds: NodeId[] = []
    const changedTreeIds = new Set<NodeId>()
    const previousTreeIds = new Set(previousIds)

    roots.forEach((root) => {
      const tree = getMindmapTree(root)
      if (!tree) return

      const nextTree = buildTree(root, tree)
      nextById.set(root.id, nextTree)
      nextIds.push(root.id)
      if (previousById.get(root.id) !== nextTree) {
        changedTreeIds.add(root.id)
      }
      previousTreeIds.delete(root.id)
    })

    previousTreeIds.forEach((treeId) => {
      changedTreeIds.add(treeId)
    })

    const idsChanged = !isSameIds(previousIds, nextIds)

    return {
      nextState: {
        entryById: nextById,
        ids: idsChanged ? nextIds : previousIds,
        visibleNodesRef: visibleNodes,
        allNodesRef: allNodes
      },
      idsChanged,
      changedTreeIds
    }
  }

  const ensureSynced = () => {
    const next = reconcile(state)
    if (next.nextState !== state) {
      commitState(next.nextState)
    }
  }

  const initial = reconcile(state)
  commitState(initial.nextState)
  projection.setList(state.ids)

  const applyChange = (impact: KernelReadImpact, snapshot: ReadSnapshot) => {
    snapshotRef = snapshot
    if (!impact.reset && !impact.node.value && !impact.node.list && !impact.node.geometry) {
      return
    }

    const next = reconcile(state)
    commitState(next.nextState)

    if (next.idsChanged) {
      projection.setList(state.ids)
    }

    projection.sync(next.changedTreeIds)
  }

  return {
    list: projection.list,
    item: projection.item,
    applyChange
  }
}
