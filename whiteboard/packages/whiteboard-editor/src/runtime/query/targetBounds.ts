import { getEdgePathBounds } from '@whiteboard/core/edge'
import {
  getTargetBounds,
  type BoundsTarget
} from '@whiteboard/core/selection'
import type { Rect } from '@whiteboard/core/types'
import type { ReadFn } from '@shared/store'
import type { EdgeRead } from '../read/edge'
import {
  getNodeItemBounds,
  type NodeRead
} from '../read/node'

export type TargetBoundsQuery = {
  get: (target: BoundsTarget) => Rect | undefined
  track: (read: ReadFn, target: BoundsTarget) => Rect | undefined
}

export const createTargetBoundsQuery = ({
  node,
  edge
}: {
  node: Pick<NodeRead, 'item'>
  edge: Pick<EdgeRead, 'resolved'>
}): TargetBoundsQuery => {
  const readNodeBounds = (input: {
    readItem: (nodeId: string) => ReturnType<NodeRead['item']['get']>
    nodeId: string
  }) => {
    const item = input.readItem(input.nodeId)
    return item
      ? getNodeItemBounds(item)
      : undefined
  }

  const readResolvedEdgeBounds = (input: {
    readResolved: (edgeId: string) => ReturnType<EdgeRead['resolved']['get']>
    edgeId: string
  }) => {
    const resolved = input.readResolved(input.edgeId)
    return resolved
      ? getEdgePathBounds(resolved.path)
      : undefined
  }

  return {
    get: (target) => getTargetBounds({
      target,
      readNodeBounds: (nodeId) => readNodeBounds({
        readItem: node.item.get,
        nodeId
      }),
      readEdgeBounds: (edgeId) => readResolvedEdgeBounds({
        readResolved: edge.resolved.get,
        edgeId
      })
    }),
    track: (readStore, target) => getTargetBounds({
      target,
      readNodeBounds: (nodeId) => readNodeBounds({
        readItem: (nextNodeId) => readStore(node.item, nextNodeId),
        nodeId
      }),
      readEdgeBounds: (edgeId) => readResolvedEdgeBounds({
        readResolved: (nextEdgeId) => readStore(edge.resolved, nextEdgeId),
        edgeId
      })
    })
  }
}
