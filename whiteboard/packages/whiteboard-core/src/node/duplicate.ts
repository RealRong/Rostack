import {
  buildInsertSliceOperations,
  exportSliceFromNodes
} from '../document'
import { ok } from '../types'
import type {
  CoreRegistries,
  Document,
  Node,
  NodeId,
  Operation,
  Point,
  EdgeId,
  Result,
  Size
} from '../types'
import { expandFrameSelection } from './frame'
import { getNodeBoundsByNode } from './bounds'

export const expandNodeSelection = (
  nodes: readonly Node[],
  selectedIds: NodeId[],
  nodeSize: Size
) => {
  const nodeById = new Map<NodeId, Node>(nodes.map((node) => [node.id, node]))
  const expandedIds = new Set<NodeId>(selectedIds)

  const withFrames = expandFrameSelection({
    nodes,
    ids: [...expandedIds],
    getNodeRect: (node) => getNodeBoundsByNode(node, nodeSize),
    getFrameRect: (node) => (
      node.type === 'frame'
        ? getNodeBoundsByNode(node, nodeSize)
        : undefined
    )
  })

  return {
    nodeById,
    expandedIds: withFrames
  }
}

type BuildNodeDuplicateOperationsInput = {
  doc: Document
  ids: readonly NodeId[]
  registries: CoreRegistries
  createNodeId: () => NodeId
  createEdgeId: () => EdgeId
  nodeSize: Size
  offset: Point
}

export const buildNodeDuplicateOperations = ({
  doc,
  ids,
  registries,
  createNodeId,
  createEdgeId,
  nodeSize,
  offset
}: BuildNodeDuplicateOperationsInput): Result<{
  operations: Operation[]
  nodeIds: NodeId[]
  edgeIds: EdgeId[]
}, 'invalid'> => {
  const exported = exportSliceFromNodes({
    doc,
    ids,
    nodeSize
  })
  if (!exported.ok) {
    return exported
  }

  const inserted = buildInsertSliceOperations({
    doc,
    slice: exported.data.slice,
    nodeSize,
    registries,
    createNodeId,
    createEdgeId,
    delta: offset,
    roots: exported.data.roots
  })
  if (!inserted.ok) {
    return inserted
  }

  return ok({
    operations: inserted.data.operations,
    nodeIds: [...inserted.data.roots.nodeIds],
    edgeIds: [...inserted.data.allEdgeIds]
  })
}
