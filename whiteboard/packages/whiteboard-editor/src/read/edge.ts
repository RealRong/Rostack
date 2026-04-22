import {
  edge as edgeApi,
  type EdgeConnectCandidate,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { collection, equal, store } from '@shared/core'
import type {
  Edge,
  EdgeId,
  NodeId,
  NodeModel,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type { EditorPublishedSources } from '@whiteboard/editor/publish/sources'
import {
  readEdgeBox,
  resolveEdgeCapability,
  type EdgeBox,
  type EdgeCapability
} from '@whiteboard/editor/projection/edgeShared'
import {
  toProjectedNodeGeometry,
  toSpatialNode,
  type ProjectionNodeRead,
  type ProjectedNode
} from '@whiteboard/editor/projection/node'

export type EdgeLabelRef = {
  edgeId: EdgeId
  labelId: string
}

export type ProjectionEdgeItem = {
  id: EdgeId
  edge: Edge
}

export type ProjectionEdgeRead = {
  list: DocumentRead['edge']['list']
  committed: DocumentRead['edge']['item']
  item: store.KeyedReadStore<EdgeId, ProjectionEdgeItem | undefined>
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

const isProjectionEdgeItemEqual = (
  left: ProjectionEdgeItem | undefined,
  right: ProjectionEdgeItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.id === right.id
    && left.edge === right.edge
  )
)

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
  readNode: Pick<ProjectionNodeRead, 'projected'>,
  edgeEnd: Edge['source'] | Edge['target']
): {
  node: ReturnType<typeof toSpatialNode>
  geometry: ReturnType<typeof toProjectedNodeGeometry>
} | undefined => {
  if (edgeEnd.kind !== 'node') {
    return undefined
  }

  const projected = store.read(readNode.projected, edgeEnd.nodeId)
  return projected
    ? {
        node: toSpatialNode(projected),
        geometry: toProjectedNodeGeometry(projected)
      }
    : undefined
}

const readEdgeGeometry = (
  node: Pick<ProjectionNodeRead, 'projected'>,
  entry: ProjectionEdgeItem
): CoreEdgeView | undefined => {
  const source = readResolvedNodeSnapshot(node, entry.edge.source)
  const target = readResolvedNodeSnapshot(node, entry.edge.target)

  if (
    (entry.edge.source.kind === 'node' && !source)
    || (entry.edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return edgeApi.view.resolve({
      edge: entry.edge,
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
  published: Pick<EditorPublishedSources, 'edge'>
  ref: EdgeLabelRef
}): Size | undefined => store.read(published.edge, ref.edgeId)?.route.labels
  .find((entry) => entry.labelId === ref.labelId)?.size

export const createProjectionEdgeRead = ({
  document,
  published,
  node
}: {
  document: Pick<DocumentRead, 'edge' | 'node'>
  published: Pick<EditorPublishedSources, 'edge'>
  node: Pick<ProjectionNodeRead, 'projected' | 'idsInRect' | 'capability'>
}): ProjectionEdgeRead => {
  const item: ProjectionEdgeRead['item'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const current = store.read(published.edge, edgeId)
      return current
        ? {
            id: edgeId,
            edge: current.base.edge
          }
        : undefined
    },
    isEqual: isProjectionEdgeItemEqual
  })

  const geometry: ProjectionEdgeRead['geometry'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const entry = store.read(item, edgeId)
      return entry
        ? readEdgeGeometry(node, entry)
        : undefined
    },
    isEqual: isEdgeGeometryEqual
  })

  const bounds: ProjectionEdgeRead['bounds'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const currentGeometry = store.read(geometry, edgeId)
      return currentGeometry
        ? edgeApi.path.bounds(currentGeometry.path)
        : undefined
    },
    isEqual: equal.sameOptionalRect
  })

  const connectCandidates: ProjectionEdgeRead['connectCandidates'] = (
    rect
  ) => {
    const nodeIds = node.idsInRect(rect)
    const candidates: EdgeConnectCandidate[] = []

    for (let index = 0; index < nodeIds.length; index += 1) {
      const projected = store.read(node.projected, nodeIds[index])
      if (!projected || !node.capability(projected.node).connect) {
        continue
      }

      candidates.push({
        nodeId: projected.node.id,
        node: toSpatialNode(projected),
        geometry: toProjectedNodeGeometry(projected)
      })
    }

    return candidates
  }

  const readNodeLocked = (
    nodeId: NodeId
  ) => Boolean(
    store.read(node.projected, nodeId)?.node.locked
    ?? store.read(document.node.committed, nodeId)?.node.locked
  )

  return {
    list: document.edge.list,
    committed: document.edge.item,
    item,
    geometry,
    edges: (edgeIds) => collection.presentValues(edgeIds, (edgeId) => store.read(item, edgeId)?.edge),
    label: {
      metrics: (ref) => readLabelMetrics({
        published,
        ref
      })
    },
    bounds,
    box: (edgeId) => readEdgeBox(
      store.read(bounds, edgeId),
      store.read(item, edgeId)?.edge
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
