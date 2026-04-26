import type {
  Node,
  Rect
} from '@whiteboard/core/types'
import { getNodesBounds } from '@whiteboard/core/node/geometry'

export const getNodesBoundingRect = (
  nodes: readonly Node[]
): Rect | undefined => getNodesBounds(nodes)

export const rectEquals = (a: Rect, b: Rect, epsilon: number) => (
  Math.abs(a.x - b.x) <= epsilon &&
  Math.abs(a.y - b.y) <= epsilon &&
  Math.abs(a.width - b.width) <= epsilon &&
  Math.abs(a.height - b.height) <= epsilon
)
