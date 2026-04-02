import type { Edge, Node } from '@whiteboard/core/types'
import type { NodeId } from '@whiteboard/core/types'

export type ReadModel = {
  nodes: {
    visible: Node[]
    canvas: Node[]
  }
  edges: {
    visible: Edge[]
  }
  canvas: {
    nodeById: Map<NodeId, Node>
    nodeIds: NodeId[]
  }
}
