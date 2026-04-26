import { document as documentApi } from '@whiteboard/core/document'
import { edge as edgeApi, resolveEdgePathFromRects, type ResolvedEdgePathFromRects } from '@whiteboard/core/edge'
import {
  resolveDocumentNodeGeometry,
  type DocumentNodeGeometry,
  type ResolvedDocumentNodeGeometry
} from '@whiteboard/core/node'
import type {
  Edge,
  EdgeId,
  NodeGeometry,
  Node,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type { SliceExportResult } from '@whiteboard/core/document'
import type { Revision } from '@shared/projection'
import type { WorkingState } from '../../contracts/working'
import { geometry as geometryApi } from '@whiteboard/core/geometry'

const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
}

type ResolverCache = {
  revision: Revision | null
  nodeIds: readonly NodeId[] | null
  edgeIds: readonly EdgeId[] | null
  nodeGeometry: Map<NodeId, ResolvedDocumentNodeGeometry | null>
  edgePath: Map<EdgeId, ResolvedEdgePathFromRects | null>
  edgeBounds: Map<EdgeId, Rect | null>
  bounds: Rect | null
}

export interface DocumentResolver {
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  nodeGeometry(id: NodeId): DocumentNodeGeometry | undefined
  bounds(): Rect
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}

const createCache = (): ResolverCache => ({
  revision: null,
  nodeIds: null,
  edgeIds: null,
  nodeGeometry: new Map(),
  edgePath: new Map(),
  edgeBounds: new Map(),
  bounds: null
})

export const createDocumentResolver = (input: {
  state: () => WorkingState
}): DocumentResolver => {
  let cache = createCache()

  const readState = () => input.state()
  const readSnapshot = () => readState().document.snapshot

  const ensureCache = () => {
    const revision = readState().revision.document
    if (cache.revision === revision) {
      return
    }

    cache = createCache()
    cache.revision = revision
  }

  const readResolvedNodeGeometry = (
    nodeId: NodeId
  ): ResolvedDocumentNodeGeometry | undefined => {
    ensureCache()
    const cached = cache.nodeGeometry.get(nodeId)
    if (cached !== undefined) {
      return cached ?? undefined
    }

    const node = readSnapshot().nodes[nodeId]
    const next = node
      ? resolveDocumentNodeGeometry({
          node
        })
      : null
    cache.nodeGeometry.set(nodeId, next)
    return next ?? undefined
  }

  const readEdgePath = (
    edgeId: EdgeId
  ): ResolvedEdgePathFromRects | undefined => {
    ensureCache()
    const cached = cache.edgePath.get(edgeId)
    if (cached !== undefined) {
      return cached ?? undefined
    }

    const edge = readSnapshot().edges[edgeId]
    if (!edge) {
      cache.edgePath.set(edgeId, null)
      return undefined
    }

    try {
      const next = resolveEdgePathFromRects({
        edge,
        source: edge.source.kind === 'node'
          ? toEdgeNodeSnapshot(edge.source.nodeId)
          : undefined,
        target: edge.target.kind === 'node'
          ? toEdgeNodeSnapshot(edge.target.nodeId)
          : undefined
      })
      cache.edgePath.set(edgeId, next)
      return next
    } catch {
      cache.edgePath.set(edgeId, null)
      return undefined
    }
  }

  const readEdgeBounds = (
    edgeId: EdgeId
  ): Rect | undefined => {
    ensureCache()
    const cached = cache.edgeBounds.get(edgeId)
    if (cached !== undefined) {
      return cached ?? undefined
    }

    const path = readEdgePath(edgeId)
    const next = path
      ? edgeApi.path.bounds(path.path) ?? null
      : null
    cache.edgeBounds.set(edgeId, next)
    return next ?? undefined
  }

  const toEdgeNodeSnapshot = (
    nodeId: NodeId
  ): {
    node: Node
    geometry: NodeGeometry
  } | undefined => {
    const node = readSnapshot().nodes[nodeId]
    const geometry = readResolvedNodeGeometry(nodeId)
    return node && geometry
      ? {
          node,
          geometry: {
            rect: geometry.rect,
            bounds: geometry.bounds,
            outline: geometry.outline
          }
        }
      : undefined
  }

  return {
    node: (id) => readSnapshot().nodes[id],
    edge: (id) => readSnapshot().edges[id],
    nodeIds: () => {
      ensureCache()
      if (!cache.nodeIds) {
        cache.nodeIds = Object.keys(readSnapshot().nodes) as readonly NodeId[]
      }
      return cache.nodeIds
    },
    edgeIds: () => {
      ensureCache()
      if (!cache.edgeIds) {
        cache.edgeIds = Object.keys(readSnapshot().edges) as readonly EdgeId[]
      }
      return cache.edgeIds
    },
    nodeGeometry: (id) => {
      const geometry = readResolvedNodeGeometry(id)
      return geometry
        ? {
            rect: geometry.rect,
            bounds: geometry.bounds,
            rotation: geometry.rotation
          }
        : undefined
    },
    bounds: () => {
      ensureCache()
      if (cache.bounds !== null) {
        return cache.bounds
      }

      const nodeBounds = (Object.keys(readSnapshot().nodes) as readonly NodeId[])
        .flatMap((nodeId) => {
          const geometry = readResolvedNodeGeometry(nodeId)
          return geometry ? [geometry.bounds] : []
        })
      const edgeBounds = (Object.keys(readSnapshot().edges) as readonly EdgeId[])
        .flatMap((edgeId) => {
          const bounds = readEdgeBounds(edgeId)
          return bounds ? [bounds] : []
        })

      const next = geometryApi.rect.boundingRect([
        ...nodeBounds,
        ...edgeBounds
      ]) ?? EMPTY_RECT
      cache.bounds = next
      return next
    },
    slice: ({ nodeIds, edgeIds }) => {
      const exported = documentApi.slice.export.selection({
        doc: readSnapshot(),
        nodeIds,
        edgeIds
      })

      return exported.ok
        ? exported.data
        : undefined
    }
  }
}
