import { resolveEdgeEnds } from '@whiteboard/core/edge/endpoints'
import { resolveEdgeView } from '@whiteboard/core/edge/view'
import { resolveCommittedNodeView } from '@whiteboard/core/node/committed'
import { getNodeGeometry } from '@whiteboard/core/node/outline'
import type {
  Document,
  Edge,
  EdgeId,
  Size
} from '@whiteboard/core/types'
import type {
  EdgeView,
  ResolvedEdgeEnds
} from '@whiteboard/core/types/edge'

export type CommittedEdgeView = {
  id: EdgeId
  edge: Edge
  ends: ResolvedEdgeEnds
}

const readEdgeNodeSnapshot = (input: {
  document: Document
  nodeSize: Size
  nodeId: string
}) => {
  const node = input.document.nodes[input.nodeId]
  if (!node) {
    return undefined
  }

  const view = resolveCommittedNodeView({
    node,
    nodeSize: input.nodeSize
  })

  return {
    node,
    geometry: {
      rect: view.rect,
      bounds: view.bounds,
      outline: getNodeGeometry(
        node,
        view.rect,
        view.rotation
      ).outline
    }
  }
}

export const resolveCommittedEdgeView = (input: {
  edge: Edge
  document: Document
  nodeSize: Size
}): CommittedEdgeView | undefined => {
  const ends = resolveEdgeEnds({
    edge: input.edge,
    source: input.edge.source.kind === 'node'
      ? readEdgeNodeSnapshot({
          document: input.document,
          nodeSize: input.nodeSize,
          nodeId: input.edge.source.nodeId
        })
      : undefined,
    target: input.edge.target.kind === 'node'
      ? readEdgeNodeSnapshot({
          document: input.document,
          nodeSize: input.nodeSize,
          nodeId: input.edge.target.nodeId
        })
      : undefined
  })
  if (!ends) {
    return undefined
  }

  return {
    id: input.edge.id,
    edge: input.edge,
    ends
  }
}

export const resolveCommittedEdgeRenderView = (input: {
  edge: Edge
  document: Document
  nodeSize: Size
}): EdgeView | undefined => {
  const source = input.edge.source.kind === 'node'
    ? readEdgeNodeSnapshot({
        document: input.document,
        nodeSize: input.nodeSize,
        nodeId: input.edge.source.nodeId
      })
    : undefined
  const target = input.edge.target.kind === 'node'
    ? readEdgeNodeSnapshot({
        document: input.document,
        nodeSize: input.nodeSize,
        nodeId: input.edge.target.nodeId
      })
    : undefined

  if (
    (input.edge.source.kind === 'node' && !source)
    || (input.edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return resolveEdgeView({
      edge: input.edge,
      source,
      target
    })
  } catch {
    return undefined
  }
}
