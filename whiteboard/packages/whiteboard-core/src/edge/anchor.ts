import type { EdgeAnchor, Node, Point, Rect } from '../types'
import { isPointEqual } from '../geometry'
import {
  getAutoNodeAnchor,
  projectNodeAnchor
} from '../node/outline'
import type { AnchorSnapOptions, EdgeConnectTarget } from '../types/edge'

export const isSameConnectTarget = (
  left?: EdgeConnectTarget,
  right?: EdgeConnectTarget
) => {
  if (!left && !right) return true
  if (!left || !right) return false
  return (
    left.nodeId === right.nodeId &&
    left.anchor?.side === right.anchor?.side &&
    left.anchor?.offset === right.anchor?.offset &&
    isPointEqual(left.pointWorld, right.pointWorld)
  )
}

export const getAnchorFromPoint = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect,
  rotation: number,
  point: Point,
  options: AnchorSnapOptions
) => projectNodeAnchor(node, rect, rotation, point, options)

export const getAutoAnchorFromRect = (
  node: Pick<Node, 'type' | 'data'>,
  rect: Rect,
  rotation: number,
  otherCenter: Point,
  options?: { anchorOffset?: number }
) => getAutoNodeAnchor(node, rect, rotation, otherCenter, options)
