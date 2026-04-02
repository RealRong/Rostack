import type { Rect, Size, SpatialNode } from '../types'
import { getAABBFromPoints } from './rect'
import { getRotatedCorners } from './rotation'

export const getNodeRect = (node: SpatialNode, fallback: Size): Rect => {
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

export const getNodeAABB = (node: SpatialNode, fallback: Size): Rect => {
  const rect = getNodeRect(node, fallback)
  const rotation = typeof node.rotation === 'number' ? node.rotation : 0
  if (!rotation) return rect
  const corners = getRotatedCorners(rect, rotation)
  return getAABBFromPoints(corners)
}
