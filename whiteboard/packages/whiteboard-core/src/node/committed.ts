import type {
  Node,
  NodeId,
  Rect,
  Size
} from '@whiteboard/core/types'
import { getNodeRect, readNodeRotation } from '@whiteboard/core/node/geometry'
import { getNodeGeometry } from '@whiteboard/core/node/outline'

export type CommittedNodeView = {
  id: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
}

export const resolveCommittedNodeView = (input: {
  node: Node
  nodeSize: Size
}): CommittedNodeView => {
  const rect = getNodeRect(input.node, input.nodeSize)
  const rotation = readNodeRotation(input.node)
  const geometry = getNodeGeometry(
    input.node,
    rect,
    rotation
  )

  return {
    id: input.node.id,
    node: input.node,
    rect,
    bounds: geometry.bounds,
    rotation
  }
}
