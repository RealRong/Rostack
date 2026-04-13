import { getTargetBounds, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, Node, NodeId, Rect } from '@whiteboard/core/types'
import { read } from '@shared/core'
import type { EdgePresentationRead } from './edge/read'
import type { NodePresentationRead } from './node/read'

export type RuntimeTargetRead = {
  nodes: (target: SelectionTarget) => readonly Node[]
  edges: (target: SelectionTarget) => readonly Edge[]
  bounds: (target: SelectionTarget) => Rect | undefined
}

const resolveTargetBounds = ({
  target,
  readNodeBounds,
  readEdgeBounds
}: {
  target: SelectionTarget
  readNodeBounds: (nodeId: NodeId) => Rect | undefined
  readEdgeBounds: (edgeId: EdgeId) => Rect | undefined
}): Rect | undefined => getTargetBounds({
  target,
  readNodeBounds,
  readEdgeBounds
})

export const createTargetRead = ({
  node,
  edge
}: {
  node: Pick<NodePresentationRead, 'nodes' | 'bounds'>
  edge: Pick<EdgePresentationRead, 'edges' | 'bounds'>
}): RuntimeTargetRead => ({
  nodes: (target) => node.nodes(target.nodeIds),
  edges: (target) => edge.edges(target.edgeIds),
  bounds: (target) => resolveTargetBounds({
    target,
    readNodeBounds: (nodeId) => read(node.bounds, nodeId),
    readEdgeBounds: (edgeId) => read(edge.bounds, edgeId)
  })
})
