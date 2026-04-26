import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { Node, Rect, SpatialNode } from '@whiteboard/core/types'
import { getNodeBounds } from '@whiteboard/core/node/outline'

export const readNodeRotation = (
  node: Pick<SpatialNode, 'rotation'>
): number => (typeof node.rotation === 'number' ? node.rotation : 0)

export const getNodeRect = (
  node: Pick<Node, 'position' | 'size'>
): Rect => {
  const position = node.position

  return {
    x: position.x,
    y: position.y,
    width: node.size.width,
    height: node.size.height
  }
}

export const getNodeAABB = (
  node: Pick<Node, 'position' | 'size' | 'rotation'>
): Rect => {
  const rect = getNodeRect(node)
  const rotation = readNodeRotation(node)
  if (!rotation) return rect
  const corners = geometryApi.rotation.corners(rect, rotation)
  return geometryApi.rect.aabbFromPoints(corners)
}

export const getNodeBoundsByNode = (
  node: Node
): Rect | undefined => {
  const rect = getNodeRect(node)
  const rotation = readNodeRotation(node)

  return getNodeBounds(node, rect, rotation)
}

export const getNodesBounds = (
  nodes: readonly Node[]
): Rect | undefined => {
  const rects = nodes.flatMap((node) => {
    const rect = getNodeBoundsByNode(node)
    return rect ? [rect] : []
  })

  return geometryApi.rect.boundingRect(rects)
}
