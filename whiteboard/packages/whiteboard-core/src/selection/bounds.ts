import { getRectsBoundingRect } from '../geometry'
import type {
  EdgeId,
  NodeId,
  Rect
} from '../types'

export type BoundsTarget = {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}

export const getTargetBounds = ({
  target,
  readNodeBounds,
  readEdgeBounds
}: {
  target: BoundsTarget
  readNodeBounds: (nodeId: NodeId) => Rect | undefined
  readEdgeBounds: (edgeId: EdgeId) => Rect | undefined
}): Rect | undefined => {
  const nodeIds = target.nodeIds ?? []
  const edgeIds = target.edgeIds ?? []
  if (!nodeIds.length && !edgeIds.length) {
    return undefined
  }

  const rectNodeIds = new Set<NodeId>()
  const rects: Rect[] = []

  const pushNodeRect = (nodeId: NodeId) => {
    if (rectNodeIds.has(nodeId)) {
      return
    }

    const rect = readNodeBounds(nodeId)
    if (!rect) {
      return
    }

    rectNodeIds.add(nodeId)
    rects.push(rect)
  }

  nodeIds.forEach(pushNodeRect)

  edgeIds.forEach((edgeId) => {
    const rect = readEdgeBounds(edgeId)
    if (rect) {
      rects.push(rect)
    }
  })

  return getRectsBoundingRect(rects)
}

export const resolveSelectionBoxTarget = (
  target: BoundsTarget,
  _nodes: readonly unknown[]
): BoundsTarget => {
  return target
}
