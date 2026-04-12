import { getTargetBounds, type SelectionTarget } from '@whiteboard/core/selection'
import type { EdgeId, NodeId, Rect } from '@whiteboard/core/types'

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
