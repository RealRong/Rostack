import type {
  Node,
  NodeOutline,
  Rect,
  Size
} from '@whiteboard/core/types'
import { getNodeRect, readNodeRotation } from '@whiteboard/core/node/geometry'
import { getNodeGeometry } from '@whiteboard/core/node/outline'

export interface DocumentNodeGeometry {
  rect: Rect
  bounds: Rect
  rotation: number
}

export interface ResolvedDocumentNodeGeometry extends DocumentNodeGeometry {
  outline: NodeOutline
}

export const resolveDocumentNodeGeometry = (input: {
  node: Node
  nodeSize: Size
}): ResolvedDocumentNodeGeometry => {
  const rect = getNodeRect(input.node, input.nodeSize)
  const rotation = readNodeRotation(input.node)
  const geometry = getNodeGeometry(
    input.node,
    rect,
    rotation
  )

  return {
    rect,
    bounds: geometry.bounds,
    rotation,
    outline: geometry.outline
  }
}
