import type {
  Node,
  NodeOutline,
  Rect
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
}): ResolvedDocumentNodeGeometry => {
  const rect = getNodeRect(input.node)
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
