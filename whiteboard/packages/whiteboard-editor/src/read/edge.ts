import {
  edge as edgeApi,
  type EdgeConnectCandidate,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { collection, equal, store } from '@shared/core'
import type { EdgeView } from '@whiteboard/editor-graph'
import type {
  Edge,
  EdgeId,
  NodeId,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type { ProjectionSources } from '@whiteboard/editor/projection/sources'
import {
  readEdgeBox,
  resolveEdgeCapability,
  type EdgeBox,
  type EdgeCapability
} from '@whiteboard/editor/read/edgeShared'
import {
  toGraphNodeGeometry,
  toSpatialNode,
  type GraphNodeRead
} from '@whiteboard/editor/read/node'

export type EdgeLabelRef = {
  edgeId: EdgeId
  labelId: string
}

export type GraphEdgeRead = {
  list: DocumentRead['edge']['list']
  committed: DocumentRead['edge']['item']
  view: store.KeyedReadStore<EdgeId, EdgeView | undefined>
  geometry: store.KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  label: {
    metrics: (ref: EdgeLabelRef) => Size | undefined
  }
  bounds: store.KeyedReadStore<EdgeId, Rect | undefined>
  box: (edgeId: EdgeId) => EdgeBox | undefined
  capability: (edge: Edge) => EdgeCapability
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: {
    match?: 'touch' | 'contain'
  }) => EdgeId[]
  connectCandidates: (rect: Rect) => readonly EdgeConnectCandidate[]
}

const isEdgePathSegmentEqual = (
  left: CoreEdgeView['path']['segments'][number],
  right: CoreEdgeView['path']['segments'][number]
) => (
  left === right
  || (
    left.role === right.role
    && left.insertIndex === right.insertIndex
    && geometryApi.equal.point(left.from, right.from)
    && geometryApi.equal.point(left.to, right.to)
    && geometryApi.equal.point(left.insertPoint, right.insertPoint)
    && equal.samePointArray(left.hitPoints, right.hitPoints)
  )
)

const isEdgeHandleEqual = (
  left: CoreEdgeView['handles'][number],
  right: CoreEdgeView['handles'][number]
) => {
  if (left === right) {
    return true
  }
  if (left.kind !== right.kind) {
    return false
  }
  if (!geometryApi.equal.point(left.point, right.point)) {
    return false
  }

  switch (left.kind) {
    case 'end':
      return right.kind === 'end' && left.end === right.end
    case 'anchor':
      return (
        right.kind === 'anchor'
        && left.index === right.index
        && left.mode === right.mode
      )
    case 'segment':
      return (
        right.kind === 'segment'
        && left.role === right.role
        && left.insertIndex === right.insertIndex
        && left.segmentIndex === right.segmentIndex
        && left.axis === right.axis
      )
  }
}

const isEdgeGeometryEqual = (
  left: CoreEdgeView | undefined,
  right: CoreEdgeView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && edgeApi.equal.resolvedEnd(left.ends.source, right.ends.source)
    && edgeApi.equal.resolvedEnd(left.ends.target, right.ends.target)
    && left.path.svgPath === right.path.svgPath
    && equal.samePointArray(left.path.points, right.path.points)
    && geometryApi.equal.point(left.path.label, right.path.label)
    && equal.sameOrder(
      left.path.segments,
      right.path.segments,
      isEdgePathSegmentEqual
    )
    && equal.sameOrder(
      left.handles,
      right.handles,
      isEdgeHandleEqual
    )
  )
)

const readResolvedNodeSnapshot = (
  readNode: Pick<GraphNodeRead, 'view'>,
  edgeEnd: Edge['source'] | Edge['target']
): {
  node: ReturnType<typeof toSpatialNode>
  geometry: ReturnType<typeof toGraphNodeGeometry>
} | undefined => {
  if (edgeEnd.kind !== 'node') {
    return undefined
  }

  const view = store.read(readNode.view, edgeEnd.nodeId)
  return view
    ? {
        node: toSpatialNode({
          node: view.base.node,
          rect: view.layout.rect,
          rotation: view.layout.rotation
        }),
        geometry: toGraphNodeGeometry({
          node: view.base.node,
          rect: view.layout.rect,
          rotation: view.layout.rotation
        })
      }
    : undefined
}

const readEdgeGeometry = (
  node: Pick<GraphNodeRead, 'view'>,
  edge: Edge
): CoreEdgeView | undefined => {
  const source = readResolvedNodeSnapshot(node, edge.source)
  const target = readResolvedNodeSnapshot(node, edge.target)

  if (
    (edge.source.kind === 'node' && !source)
    || (edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return edgeApi.view.resolve({
      edge,
      source,
      target
    })
  } catch {
    return undefined
  }
}

const readLabelMetrics = ({
  published,
  ref
}: {
  published: Pick<ProjectionSources, 'edge'>
  ref: EdgeLabelRef
}): Size | undefined => store.read(published.edge, ref.edgeId)?.route.labels
  .find((entry) => entry.labelId === ref.labelId)?.size

export const createGraphEdgeRead = ({
  document,
  sources,
  node
}: {
  document: Pick<DocumentRead, 'edge' | 'node'>
  sources: Pick<ProjectionSources, 'edge'>
  node: Pick<GraphNodeRead, 'view' | 'idsInRect' | 'capability'>
}): GraphEdgeRead => {
  const geometry: GraphEdgeRead['geometry'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const edge = store.read(sources.edge, edgeId)?.base.edge
      return edge ? readEdgeGeometry(node, edge) : undefined
    },
    isEqual: isEdgeGeometryEqual
  })

  const bounds: GraphEdgeRead['bounds'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const currentGeometry = store.read(geometry, edgeId)
      return currentGeometry
        ? edgeApi.path.bounds(currentGeometry.path)
        : undefined
    },
    isEqual: equal.sameOptionalRect
  })

  const connectCandidates: GraphEdgeRead['connectCandidates'] = (
    rect
  ) => {
    const nodeIds = node.idsInRect(rect)
    const candidates: EdgeConnectCandidate[] = []

    for (let index = 0; index < nodeIds.length; index += 1) {
      const view = store.read(node.view, nodeIds[index])
      if (!view || !node.capability(view.base.node).connect) {
        continue
      }

      candidates.push({
        nodeId: view.base.node.id,
        node: toSpatialNode({
          node: view.base.node,
          rect: view.layout.rect,
          rotation: view.layout.rotation
        }),
        geometry: toGraphNodeGeometry({
          node: view.base.node,
          rect: view.layout.rect,
          rotation: view.layout.rotation
        })
      })
    }

    return candidates
  }

  const readNodeLocked = (
    nodeId: NodeId
  ) => Boolean(
    store.read(node.view, nodeId)?.base.node.locked
    ?? store.read(document.node.committed, nodeId)?.node.locked
  )

  return {
    list: document.edge.list,
    committed: document.edge.item,
    view: sources.edge,
    geometry,
    edges: (edgeIds) => collection.presentValues(edgeIds, (edgeId) => store.read(sources.edge, edgeId)?.base.edge),
    label: {
      metrics: (ref) => readLabelMetrics({
        published: sources,
        ref
      })
    },
    bounds,
    box: (edgeId) => readEdgeBox(
      store.read(bounds, edgeId),
      store.read(sources.edge, edgeId)?.base.edge
    ),
    capability: (edge) => resolveEdgeCapability({
      edge,
      readNodeLocked
    }),
    related: document.edge.related,
    idsInRect: (rect, options) => {
      const mode = options?.match ?? 'touch'
      return store.read(document.edge.list).filter((edgeId) => {
        const view = store.read(geometry, edgeId)
        return view
          ? edgeApi.hit.test({
              path: view.path,
              queryRect: rect,
              mode
            })
          : false
      })
    },
    connectCandidates
  }
}
