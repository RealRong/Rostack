import { document as documentApi } from '@whiteboard/core/document'
import { edge as edgeApi, resolveCommittedEdgeRenderView } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  EdgeId,
  NodeId,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { WorkingState } from '../../contracts/working'

const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
}

export const readCommittedDocumentBounds = (input: {
  state: WorkingState
  nodeSize: Size
}): Rect => {
  const nodeBounds = [...input.state.document.nodes.values()].map((entry) => entry.bounds)
  const edgeBounds = [...input.state.document.edges.keys()].flatMap((edgeId) => {
    const edge = input.state.document.snapshot.edges[edgeId]
    if (!edge) {
      return []
    }

    const view = resolveCommittedEdgeRenderView({
      edge,
      document: input.state.document.snapshot,
      nodeSize: input.nodeSize
    })
    const bounds = view
      ? edgeApi.path.bounds(view.path)
      : undefined

    return bounds ? [bounds] : []
  })

  return geometryApi.rect.boundingRect([
    ...nodeBounds,
    ...edgeBounds
  ]) ?? EMPTY_RECT
}

export const readCommittedDocumentSlice = (input: {
  state: WorkingState
  nodeSize: Size
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}) => {
  const exported = documentApi.slice.export.selection({
    doc: input.state.document.snapshot,
    nodeIds: input.nodeIds,
    edgeIds: input.edgeIds,
    nodeSize: input.nodeSize
  })

  return exported.ok
    ? exported.data
    : undefined
}
