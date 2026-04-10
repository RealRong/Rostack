import {
  getAABBFromPoints,
  getRectsBoundingRect,
  getRotatedCorners
} from '../geometry'
import type { Node, Rect, Size, SpatialNode } from '../types'
import { getNodeBounds } from './outline'

export const getNodeRect = (
  node: SpatialNode,
  fallback: Size
): Rect => {
  const width = node.size?.width ?? fallback.width
  const height = node.size?.height ?? fallback.height
  const position = node.position

  return {
    x: position.x,
    y: position.y,
    width,
    height
  }
}

export const getNodeAABB = (
  node: SpatialNode,
  fallback: Size
): Rect => {
  const rect = getNodeRect(node, fallback)
  const rotation = typeof node.rotation === 'number' ? node.rotation : 0
  if (!rotation) return rect
  const corners = getRotatedCorners(rect, rotation)
  return getAABBFromPoints(corners)
}

export const getNodeBoundsByNode = (
  node: Node,
  fallbackSize: Size
): Rect | undefined => {
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
