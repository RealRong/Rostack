import { getNodeRect, getRectsBoundingRect } from '../geometry'
import type { Node, Rect, Size } from '../types'
import { getNodeBounds } from './outline'

export const getNodeBoundsByNode = (
  node: Node,
  fallbackSize: Size
): Rect | undefined => {
  if (node.type === 'group') {
    return undefined
  }

  const rect = getNodeRect(node, fallbackSize)
  const rotation = typeof node.rotation === 'number' ? node.rotation : 0

  return getNodeBounds(node, rect, rotation)
}

export const getNodesBounds = (
  nodes: readonly Node[],
  fallbackSize: Size
): Rect | undefined => {
  const rects = nodes.flatMap((node) => {
    const rect = getNodeBoundsByNode(node, fallbackSize)
    return rect ? [rect] : []
  })

  return getRectsBoundingRect(rects)
}
