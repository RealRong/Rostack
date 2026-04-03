import { getNodeAABB, getNodeRect, getRectsBoundingRect } from '../geometry'
import type { Node, Rect, Size } from '../types'
import { getNodeOutlineBounds } from './outline'

export const getNodeVisualBounds = (
  node: Node,
  fallbackSize: Size
): Rect | undefined => {
  if (node.type === 'group') {
    return undefined
  }

  if (node.type === 'shape') {
    const rect = getNodeRect(node, fallbackSize)
    const rotation = typeof node.rotation === 'number' ? node.rotation : 0

    return getNodeOutlineBounds(node, rect, rotation)
  }

  return getNodeAABB(node, fallbackSize)
}

export const getNodesVisualBoundingRect = (
  nodes: readonly Node[],
  fallbackSize: Size
): Rect | undefined => {
  const rects = nodes.flatMap((node) => {
    const rect = getNodeVisualBounds(node, fallbackSize)
    return rect ? [rect] : []
  })

  return getRectsBoundingRect(rects)
}
