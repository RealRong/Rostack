import { getTargetBounds, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, Node, NodeId, Rect } from '@whiteboard/core/types'
import { read } from '@shared/core'
import type { EdgeRead } from './edge'
import type { NodeRead } from './node'

export type RuntimeTargetRead = {
  nodes: (target: SelectionTarget) => readonly Node[]
  edges: (target: SelectionTarget) => readonly Edge[]
  bounds: (target: SelectionTarget) => Rect | undefined
}

const resolveTargetNodes = ({
  target,
  readNode
}: {
  target: SelectionTarget
  readNode: (nodeId: NodeId) => Node | undefined
}): Node[] => target.nodeIds
  .map((nodeId) => readNode(nodeId))
  .filter((entry): entry is Node => Boolean(entry))

const resolveTargetEdges = ({
  target,
  readEdge
}: {
  target: SelectionTarget
  readEdge: (edgeId: EdgeId) => Edge | undefined
}): Edge[] => target.edgeIds
  .map((edgeId) => readEdge(edgeId))
  .filter((entry): entry is Edge => Boolean(entry))

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
  node: Pick<NodeRead, 'item' | 'bounds'>
  edge: Pick<EdgeRead, 'item' | 'bounds'>
}): RuntimeTargetRead => ({
  nodes: (target) => resolveTargetNodes({
    target,
    readNode: (nodeId) => read(node.item, nodeId)?.node
  }),
  edges: (target) => resolveTargetEdges({
    target,
    readEdge: (edgeId) => read(edge.item, edgeId)?.edge
  }),
  bounds: (target) => resolveTargetBounds({
    target,
    readNodeBounds: (nodeId) => read(node.bounds, nodeId),
    readEdgeBounds: (edgeId) => read(edge.bounds, edgeId)
  })
})
