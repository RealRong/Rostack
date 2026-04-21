import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, NodeId, NodeModel, Rect } from '@whiteboard/core/types'
import { store } from '@shared/core'
import type { EdgePresentationRead } from '@whiteboard/editor/query/edge/read'
import type { NodePresentationRead } from '@whiteboard/editor/query/node/read'

export type RuntimeTargetRead = {
  nodes: (target: SelectionTarget) => readonly NodeModel[]
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
}): Rect | undefined => selectionApi.bounds.get({
  target,
  readNodeBounds,
  readEdgeBounds
})

export const createTargetRead = ({
  node,
  edge
}: {
  node: Pick<NodePresentationRead, 'nodes' | 'projected'>
  edge: Pick<EdgePresentationRead, 'edges' | 'bounds'>
}): RuntimeTargetRead => ({
  nodes: (target) => node.nodes(target.nodeIds),
  edges: (target) => edge.edges(target.edgeIds),
  bounds: (target) => resolveTargetBounds({
    target,
    readNodeBounds: (nodeId) => store.read(node.projected, nodeId)?.bounds,
    readEdgeBounds: (edgeId) => store.read(edge.bounds, edgeId)
  })
})
