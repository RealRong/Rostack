import type { ReadModel } from '#whiteboard-engine/types/read'
import type { Document, Edge, Node, NodeId } from '@whiteboard/core/types'
import {
  toLayerOrderedCanvasNodeIds
} from '@whiteboard/core/node'
import {
  sameIdOrder as isSameIdOrder,
  sameMapRefs as isSameMapValueRefs,
  sameOrder as isSameRefOrder
} from '@shared/core'
import {
  deriveNodeReadSlices,
  deriveVisibleEdges
} from '#whiteboard-engine/read/store/nodeReadModel'

const isSameModelRefs = (
  cache: ReadModel | undefined,
  {
    visibleNodes,
    canvasNodes,
    visibleEdges,
    nodeById,
    nodeIds
  }: {
    visibleNodes: Node[]
    canvasNodes: Node[]
    visibleEdges: Edge[]
    nodeById: ReadModel['canvas']['nodeById']
    nodeIds: ReadModel['canvas']['nodeIds']
  }
): cache is ReadModel => {
  if (!cache) return false
  return (
    cache.nodes.visible === visibleNodes &&
    cache.nodes.canvas === canvasNodes &&
    cache.edges.visible === visibleEdges &&
    cache.canvas.nodeById === nodeById &&
    cache.canvas.nodeIds === nodeIds
  )
}

export const createReadModel = ({
  readDocument
}: {
  readDocument: () => Document
}) => {
  const EMPTY_NODES: Node[] = []
  const EMPTY_EDGES: Edge[] = []
  const EMPTY_NODE_IDS: NodeId[] = []
  const EMPTY_NODE_MAP = new Map<NodeId, Node>()

  let previousDocumentRef: Document | undefined
  let previousNodesRef: Document['nodes'] | undefined
  let visibleNodesCache: Node[] = EMPTY_NODES
  let canvasNodesCache: Node[] = EMPTY_NODES
  let canvasNodeByIdCache: Map<NodeId, Node> = EMPTY_NODE_MAP
  let canvasNodeIdsCache: NodeId[] = EMPTY_NODE_IDS
  let canvasCache: ReadModel['canvas'] = {
    nodeById: EMPTY_NODE_MAP,
    nodeIds: EMPTY_NODE_IDS
  }

  type EdgeVisibleCache = {
    edgesRef: Document['edges']
    canvasNodes: Node[]
    visibleEdges: Edge[]
  }
  let edgeVisibleCache: EdgeVisibleCache | undefined

  let cache: ReadModel | undefined

  return (): ReadModel => {
    const doc = readDocument()
    if (cache && previousDocumentRef === doc) {
      return cache
    }

    const nodes = doc.nodes

    if (Object.keys(nodes).length === 0) {
      previousNodesRef = nodes
      visibleNodesCache = EMPTY_NODES
      canvasNodesCache = EMPTY_NODES
      canvasNodeByIdCache = EMPTY_NODE_MAP
      canvasNodeIdsCache = EMPTY_NODE_IDS
      canvasCache = {
        nodeById: EMPTY_NODE_MAP,
        nodeIds: EMPTY_NODE_IDS
      }
    } else if (nodes !== previousNodesRef) {
      const previousCanvasNodesCache = canvasNodesCache
      const next = deriveNodeReadSlices(doc)
      const normalizedVisible = next.visible.length ? next.visible : EMPTY_NODES
      const normalizedCanvas = next.canvas.length ? next.canvas : EMPTY_NODES
      const normalizedCanvasNodeById = next.canvasNodeById.size
        ? next.canvasNodeById
        : EMPTY_NODE_MAP
      const normalizedCanvasNodeIds = normalizedCanvas.length
        ? toLayerOrderedCanvasNodeIds(normalizedCanvas)
        : EMPTY_NODE_IDS

      visibleNodesCache = isSameRefOrder(visibleNodesCache, normalizedVisible)
        ? visibleNodesCache
        : normalizedVisible
      canvasNodesCache = isSameRefOrder(canvasNodesCache, normalizedCanvas)
        ? canvasNodesCache
        : normalizedCanvas
      canvasNodeByIdCache = canvasNodesCache === previousCanvasNodesCache ||
        isSameMapValueRefs(canvasNodeByIdCache, normalizedCanvasNodeById)
        ? canvasNodeByIdCache
        : normalizedCanvasNodeById
      canvasNodeIdsCache = isSameRefOrder(canvasNodeIdsCache, normalizedCanvasNodeIds)
        ? canvasNodeIdsCache
        : normalizedCanvasNodeIds
      canvasCache = (
        canvasCache.nodeById === canvasNodeByIdCache &&
        canvasCache.nodeIds === canvasNodeIdsCache
      )
        ? canvasCache
        : {
            nodeById: canvasNodeByIdCache,
            nodeIds: canvasNodeIdsCache
          }

      previousNodesRef = nodes
    }

    let visibleEdgesCache: Edge[]
    if (!Object.keys(doc.edges).length || !canvasNodesCache.length) {
      visibleEdgesCache = EMPTY_EDGES
      edgeVisibleCache = {
        edgesRef: doc.edges,
        canvasNodes: canvasNodesCache,
        visibleEdges: visibleEdgesCache
      }
    } else if (
      edgeVisibleCache &&
      edgeVisibleCache.edgesRef === doc.edges &&
      isSameIdOrder(edgeVisibleCache.canvasNodes, canvasNodesCache)
    ) {
      visibleEdgesCache = edgeVisibleCache.visibleEdges
    } else {
      const nextVisibleEdges = deriveVisibleEdges(
        doc,
        canvasNodesCache
      )
      visibleEdgesCache = nextVisibleEdges.length ? nextVisibleEdges : EMPTY_EDGES
      edgeVisibleCache = {
        edgesRef: doc.edges,
        canvasNodes: canvasNodesCache,
        visibleEdges: visibleEdgesCache
      }
    }

    previousDocumentRef = doc
    if (isSameModelRefs(cache, {
      visibleNodes: visibleNodesCache,
      canvasNodes: canvasNodesCache,
      visibleEdges: visibleEdgesCache,
      nodeById: canvasCache.nodeById,
      nodeIds: canvasCache.nodeIds
    })) {
      return cache
    }

    cache = {
      nodes: {
        visible: visibleNodesCache,
        canvas: canvasNodesCache
      },
      edges: {
        visible: visibleEdgesCache
      },
      canvas: canvasCache
    }
    return cache
  }
}
