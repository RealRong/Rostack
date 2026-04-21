import type { Node, NodeModel, Rect } from '@whiteboard/core/types'

export const toSpatialNode = ({
  node,
  rect,
  rotation
}: {
  node: NodeModel
  rect: Rect
  rotation: number
}): Node => ({
  ...node,
  position: {
    x: rect.x,
    y: rect.y
  },
  size: {
    width: rect.width,
    height: rect.height
  },
  rotation
})
