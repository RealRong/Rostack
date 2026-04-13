import {
  listEdges,
  listNodes
} from '@whiteboard/core/document'
import { isNodeEdgeEnd } from '@whiteboard/core/edge'
import { expandFrameSelection, getNodeBounds, getNodeRect, readNodeRotation } from '@whiteboard/core/node'
import type {
  Document,
  EdgeId,
  Node,
  NodeId,
  Size
} from '@whiteboard/core/types'

const boundsOf = (node: Node, fallbackSize: Size) =>
  getNodeBounds(
    node,
    getNodeRect(node, fallbackSize),
    readNodeRotation(node)
  )

export const expand = (
  nodes: readonly Node[],
  selectedIds: readonly NodeId[],
  nodeSize: Size
) => {
  const expandedIds = new Set<NodeId>(selectedIds)

  return expandFrameSelection({
    nodes,
    ids: [...expandedIds],
    getNodeRect: (node) => boundsOf(node, nodeSize),
    getFrameRect: (node) => (
      node.type === 'frame'
        ? boundsOf(node, nodeSize)
        : undefined
    )
  })
}

export const cascadeDeleteTargets = ({
  doc,
  ids,
  nodeSize
}: {
  doc: Document
  ids: readonly NodeId[]
  nodeSize: Size
}) => {
  const expandedIds = expand(
    listNodes(doc),
    ids,
    nodeSize
  )
  if (!expandedIds.size) {
    return {
      nodeIds: [],
      edgeIds: []
    }
  }

  const edgeIds = listEdges(doc)
    .filter(
      (edge) =>
        (isNodeEdgeEnd(edge.source) && expandedIds.has(edge.source.nodeId))
        || (isNodeEdgeEnd(edge.target) && expandedIds.has(edge.target.nodeId))
    )
    .map((edge) => edge.id)

  return {
    nodeIds: Array.from(expandedIds),
    edgeIds: Array.from(new Set<EdgeId>(edgeIds))
  }
}
