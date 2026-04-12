import { getTargetBounds, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, Node, NodeId, Rect } from '@whiteboard/core/types'

export const resolveGroupTarget = ({
  groupId,
  readNodeIds,
  readEdgeIds
}: {
  groupId: string
  readNodeIds: (groupId: string) => readonly NodeId[]
  readEdgeIds: (groupId: string) => readonly EdgeId[]
}) => {
  const nodeIds = readNodeIds(groupId)
  const edgeIds = readEdgeIds(groupId)

  return nodeIds.length > 0 || edgeIds.length > 0
    ? {
        nodeIds,
        edgeIds
      }
    : undefined
}

export const resolveTargetNodes = ({
  target,
  readNode
}: {
  target: SelectionTarget
  readNode: (nodeId: NodeId) => Node | undefined
}): Node[] => target.nodeIds
  .map((nodeId) => readNode(nodeId))
  .filter((entry): entry is Node => Boolean(entry))

export const resolveTargetEdges = ({
  target,
  readEdge
}: {
  target: SelectionTarget
  readEdge: (edgeId: EdgeId) => Edge | undefined
}): Edge[] => target.edgeIds
  .map((edgeId) => readEdge(edgeId))
  .filter((entry): entry is Edge => Boolean(entry))

export const resolveTargetBounds = ({
  target,
  readNodeBounds,
  readEdgeBounds
}: {
  target: SelectionTarget
  readNodeBounds: (nodeId: NodeId) => Rect | undefined
  readEdgeBounds: (edgeId: EdgeId) => Rect | undefined
}): Rect | undefined => getTargetBounds({
  target,
  readNodeBounds,
  readEdgeBounds
})
