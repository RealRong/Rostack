import { listEdges, listNodes } from '@whiteboard/core/document'
import { isNodeEdgeEnd } from '@whiteboard/core/edge'
import type { Document, Edge, Node, NodeId } from '@whiteboard/core/types'

const EMPTY_NODES: Node[] = []
const EMPTY_NODE_MAP = new Map<NodeId, Node>()

export type NodeReadSlices = {
  ordered: Node[]
  visible: Node[]
  canvas: Node[]
  canvasNodeById: Map<NodeId, Node>
}

export const deriveVisibleEdges = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>,
  canvasNodes: readonly Node[]
): Edge[] => {
  const orderedEdges = listEdges(document)
  if (!orderedEdges.length) return []

  const canvasNodeIds = new Set<NodeId>(canvasNodes.map((node) => node.id))
  const visibleEdges = orderedEdges.filter(
    (edge) =>
      (!isNodeEdgeEnd(edge.source) || canvasNodeIds.has(edge.source.nodeId))
      && (!isNodeEdgeEnd(edge.target) || canvasNodeIds.has(edge.target.nodeId))
  )

  return visibleEdges
}

export const deriveNodeReadSlices = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>
): NodeReadSlices => {
  const ordered = listNodes(document)
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
