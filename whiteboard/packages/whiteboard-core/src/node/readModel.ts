import type { Edge, EdgeId, EntityCollection, Node, NodeId } from '../types'
import { isNodeEdgeEnd, listEdges, listNodes } from '../types'

const EMPTY_EDGE_IDS: EdgeId[] = []
const EMPTY_NODES: Node[] = []
const EMPTY_NODE_MAP = new Map<NodeId, Node>()

export type NodeReadSlices = {
  ordered: Node[]
  visible: Node[]
  canvas: Node[]
  canvasNodeById: Map<NodeId, Node>
}

export const orderByIds = <T extends { id: string }>(
  items: T[],
  ids?: readonly string[]
) => {
  if (!ids?.length) return items

  if (items.length === ids.length) {
    let sameOrder = true
    for (let index = 0; index < items.length; index += 1) {
      if (items[index]?.id !== ids[index]) {
        sameOrder = false
        break
      }
    }
    if (sameOrder) return items
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const idSet = new Set(ids)
  const ordered: T[] = []

  ids.forEach((id) => {
    const item = byId.get(id)
    if (item) {
      ordered.push(item)
    }
  })

  if (ordered.length === items.length) return ordered

  items.forEach((item) => {
    if (!idSet.has(item.id)) {
      ordered.push(item)
    }
  })

  return ordered
}

export const deriveVisibleEdges = (
  edges: EntityCollection<EdgeId, Edge>,
  canvasNodes: readonly Node[],
  edgeOrder: readonly EdgeId[] = edges.order
): Edge[] => {
  const orderedEdges = listEdges({ edges })
  if (!orderedEdges.length) return []

  const canvasNodeIds = new Set<NodeId>(canvasNodes.map((node) => node.id))
  const visibleEdges = orderedEdges.filter(
    (edge) =>
      (!isNodeEdgeEnd(edge.source) || canvasNodeIds.has(edge.source.nodeId))
      && (!isNodeEdgeEnd(edge.target) || canvasNodeIds.has(edge.target.nodeId))
  )

  return orderByIds(visibleEdges, edgeOrder ?? EMPTY_EDGE_IDS)
}

export const deriveNodeReadSlices = (
  nodes: EntityCollection<NodeId, Node>
): NodeReadSlices => {
  const ordered = listNodes({ nodes })
  if (!ordered.length) {
    return {
      ordered: EMPTY_NODES,
      visible: EMPTY_NODES,
      canvas: EMPTY_NODES,
      canvasNodeById: EMPTY_NODE_MAP
    }
  }

  const visible: Node[] = []
  const canvas: Node[] = []
  const canvasNodeById = new Map<NodeId, Node>()

  ordered.forEach((node) => {
    visible.push(node)
    if (node.type !== 'mindmap') {
      canvas.push(node)
      canvasNodeById.set(node.id, node)
    }
  })

  return {
    ordered,
    visible,
    canvas,
    canvasNodeById
  }
}

export const deriveMindmapRoots = (visibleNodes: readonly Node[]): NodeId[] => {
  if (!visibleNodes.length) return []
  return visibleNodes
    .filter((node) => node.type === 'mindmap')
    .map((node) => node.id)
}
