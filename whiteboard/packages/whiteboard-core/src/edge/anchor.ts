import type { EdgeAnchor, Node, NodeGeometry, Point, Rect } from '@whiteboard/core/types'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import {
  getAutoNodeGeometryAnchor,
  getAutoNodeAnchor,
  projectNodeAnchor
} from '@whiteboard/core/node/outline'
import type { AnchorSnapOptions, EdgeConnectTarget } from '@whiteboard/core/types/edge'

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
    geometryApi.equal.point(left.pointWorld, right.pointWorld)
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

export const getAutoAnchorFromGeometry = (
  geometry: NodeGeometry,
  otherCenter: Point,
  options?: { anchorOffset?: number }
) => getAutoNodeGeometryAnchor(geometry, otherCenter, options)
