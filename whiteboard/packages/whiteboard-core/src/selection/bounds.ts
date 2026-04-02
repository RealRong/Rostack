import { getRectsBoundingRect } from '../geometry'
import type {
  EdgeId,
  Node,
  NodeId,
  Rect
} from '../types'
import { getGroupDescendants } from '../node/group'

export type BoundsTarget = {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}

export const getTargetBounds = ({
  target,
  readNodeBounds,
  readEdgeBounds
}: {
  target: BoundsTarget
  readNodeBounds: (nodeId: NodeId) => Rect | undefined
  readEdgeBounds: (edgeId: EdgeId) => Rect | undefined
}): Rect | undefined => {
  const nodeIds = target.nodeIds ?? []
  const edgeIds = target.edgeIds ?? []
  if (!nodeIds.length && !edgeIds.length) {
    return undefined
  }

  const rectNodeIds = new Set<NodeId>()
  const rects: Rect[] = []

  const pushNodeRect = (nodeId: NodeId) => {
    if (rectNodeIds.has(nodeId)) {
      return
    }

    const rect = readNodeBounds(nodeId)
    if (!rect) {
      return
    }

    rectNodeIds.add(nodeId)
    rects.push(rect)
  }

  nodeIds.forEach(pushNodeRect)

  edgeIds.forEach((edgeId) => {
    const rect = readEdgeBounds(edgeId)
    if (rect) {
      rects.push(rect)
    }
  })

  return getRectsBoundingRect(rects)
}

export const resolveSelectionBoxTarget = (
  target: BoundsTarget,
  nodes: readonly Node[]
): BoundsTarget => {
  const nodeIds = target.nodeIds ?? []
  if (!nodeIds.length) {
    return target
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const expandedNodeIds: NodeId[] = []
  const seen = new Set<NodeId>()

  const pushNodeId = (nodeId: NodeId) => {
    if (seen.has(nodeId)) {
      return
    }

    seen.add(nodeId)
    expandedNodeIds.push(nodeId)
  }

  nodeIds.forEach((nodeId) => {
    const node = nodeById.get(nodeId)
    if (!node || node.type !== 'group') {
      pushNodeId(nodeId)
      return
    }

    const content = getGroupDescendants(nodes, node.id)
      .filter((descendant) => descendant.type !== 'group')
    if (!content.length) {
      pushNodeId(node.id)
      return
    }

    content.forEach((descendant) => {
      pushNodeId(descendant.id)
    })
  })

  return {
    nodeIds: expandedNodeIds,
    edgeIds: target.edgeIds
  }
}
