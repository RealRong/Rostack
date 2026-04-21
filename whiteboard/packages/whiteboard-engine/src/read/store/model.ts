import type { ReadModel } from '@whiteboard/engine/types/read'
import type { Document, Edge, Node, NodeId } from '@whiteboard/core/types'
import { equal } from '@shared/core'
import {
  deriveNodeReadSlices,
  deriveVisibleEdges
} from '@whiteboard/engine/read/store/nodeReadModel'

const isSameModelRefs = (
  cache: ReadModel | undefined,
  {
    visibleNodes,
    canvasNodes,
    allNodes,
    visibleEdges,
    nodeById
  }: {
    visibleNodes: Node[]
    canvasNodes: Node[]
    allNodes: Node[]
    visibleEdges: Edge[]
    nodeById: ReadModel['canvas']['nodeById']
  }
): cache is ReadModel => {
  if (!cache) return false
  return (
    cache.nodes.visible === visibleNodes &&
    cache.nodes.canvas === canvasNodes &&
    cache.nodes.all === allNodes &&
    cache.edges.visible === visibleEdges &&
    cache.canvas.nodeById === nodeById
  )
}

export const createReadModel = ({
  readDocument
}: {
  readDocument: () => Document
}) => {
  const EMPTY_NODES: Node[] = []
  const EMPTY_EDGES: Edge[] = []
  const EMPTY_NODE_MAP = new Map<NodeId, Node>()

  let previousDocumentRef: Document | undefined
  let previousNodesRef: Document['nodes'] | undefined
  let visibleNodesCache: Node[] = EMPTY_NODES
  let canvasNodesCache: Node[] = EMPTY_NODES
  let allNodesCache: Node[] = EMPTY_NODES
  let canvasNodeByIdCache: Map<NodeId, Node> = EMPTY_NODE_MAP
  let canvasCache: ReadModel['canvas'] = {
    nodeById: EMPTY_NODE_MAP
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
      allNodesCache = EMPTY_NODES
      canvasNodeByIdCache = EMPTY_NODE_MAP
      canvasCache = {
        nodeById: EMPTY_NODE_MAP
      }
    } else if (nodes !== previousNodesRef) {
      const previousCanvasNodesCache = canvasNodesCache
      const next = deriveNodeReadSlices(doc)
      const normalizedVisible = next.visible.length ? next.visible : EMPTY_NODES
      const normalizedCanvas = next.canvas.length ? next.canvas : EMPTY_NODES
      const normalizedAll = next.all.length ? next.all : EMPTY_NODES
      const normalizedCanvasNodeById = next.canvasNodeById.size
        ? next.canvasNodeById
        : EMPTY_NODE_MAP

      visibleNodesCache = equal.sameOrder(visibleNodesCache, normalizedVisible)
        ? visibleNodesCache
        : normalizedVisible
      canvasNodesCache = equal.sameOrder(canvasNodesCache, normalizedCanvas)
        ? canvasNodesCache
        : normalizedCanvas
      allNodesCache = equal.sameOrder(allNodesCache, normalizedAll)
        ? allNodesCache
        : normalizedAll
      canvasNodeByIdCache = canvasNodesCache === previousCanvasNodesCache ||
        equal.sameMapRefs(canvasNodeByIdCache, normalizedCanvasNodeById)
        ? canvasNodeByIdCache
        : normalizedCanvasNodeById
      canvasCache = canvasCache.nodeById === canvasNodeByIdCache
        ? canvasCache
        : {
            nodeById: canvasNodeByIdCache
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
      equal.sameIdOrder(edgeVisibleCache.canvasNodes, canvasNodesCache)
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
      allNodes: allNodesCache,
      visibleEdges: visibleEdgesCache,
      nodeById: canvasCache.nodeById
    })) {
      return cache
    }

    cache = {
      nodes: {
        visible: visibleNodesCache,
        canvas: canvasNodesCache,
        all: allNodesCache
      },
      edges: {
        visible: visibleEdgesCache
      },
      canvas: canvasCache
    }
    return cache
  }
}
