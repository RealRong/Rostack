import type { Edge, EdgeId, NodeId } from '../types'
import type { EdgeRelations } from '../types/edge'
import { isNodeEdgeEnd } from './guards'

const linkNodeEdge = (
  nodeToEdgeIds: Map<NodeId, Set<EdgeId>>,
  nodeId: NodeId,
  edgeId: EdgeId
) => {
  const edgeIds = nodeToEdgeIds.get(nodeId) ?? new Set<EdgeId>()
  edgeIds.add(edgeId)
  nodeToEdgeIds.set(nodeId, edgeIds)
}

export const createEdgeRelations = (edges: readonly Edge[]): EdgeRelations => {
  const edgeById = new Map<EdgeId, Edge>()
  const edgeIds: EdgeId[] = []
  const nodeToEdgeIds = new Map<NodeId, Set<EdgeId>>()

  edges.forEach((edge) => {
    edgeById.set(edge.id, edge)
    edgeIds.push(edge.id)
    if (isNodeEdgeEnd(edge.source)) {
      linkNodeEdge(nodeToEdgeIds, edge.source.nodeId, edge.id)
    }
    if (isNodeEdgeEnd(edge.target)) {
      linkNodeEdge(nodeToEdgeIds, edge.target.nodeId, edge.id)
    }
  })

  return {
    edgeById,
    edgeIds,
    nodeToEdgeIds
  }
}

export const collectRelatedEdgeIds = (
  nodeToEdgeIds: ReadonlyMap<NodeId, ReadonlySet<EdgeId>>,
  nodeIds: Iterable<NodeId>
) => {
  const edgeIds = new Set<EdgeId>()
  for (const nodeId of nodeIds) {
    nodeToEdgeIds.get(nodeId)?.forEach((edgeId) => {
      edgeIds.add(edgeId)
    })
  }
  return edgeIds
}
