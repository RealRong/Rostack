import { json } from '@shared/core'
import { createEdgeOp } from '@whiteboard/core/edge/ops'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { resolveEdgeEnds } from '@whiteboard/core/edge/endpoints'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import { getNodesBoundingRect } from '@whiteboard/core/node/geometry'
import { createFrameQuery } from '@whiteboard/core/node/frame'
import { createNodeOp } from '@whiteboard/core/node/ops'
import { createId } from '@shared/core'
import { err, ok } from '@whiteboard/core/utils/result'
import type {
  CoreRegistries,
  Document,
  Edge,
  EdgeInput,
  EdgeEnd,
  EdgeId,
  Node,
  NodeInput,
  NodeId,
  Operation,
  Point,
  Rect,
  Result
} from '@whiteboard/core/types'
import type {
  Slice,
  SliceExportResult,
  SliceInsertOptions,
  SliceInsertResult,
  SliceRoots
} from '@whiteboard/core/types/document'
import { document as documentApi } from '@whiteboard/core/document'

type ExportNodesInput = {
  doc: Document
  ids: readonly NodeId[]
}

type ExportEdgeInput = {
  doc: Document
  edgeId: EdgeId
}

type ExportSelectionInput = {
  doc: Document
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}

type InsertSliceInput = {
  doc: Document
  slice: Slice
  registries: CoreRegistries
  createNodeId?: () => NodeId
  createEdgeId?: () => EdgeId
  origin?: Point
  delta?: Point
  roots?: SliceRoots
}

const toRoots = (roots?: Partial<SliceRoots>): SliceRoots => ({
  nodeIds: roots?.nodeIds ? [...roots.nodeIds] : [],
  edgeIds: roots?.edgeIds ? [...roots.edgeIds] : []
})

const dedupeIds = <T extends string>(ids: readonly T[]) => [...new Set(ids)]

const offsetPoint = (
  point: Point,
  delta: Point
): Point => ({
  x: point.x + delta.x,
  y: point.y + delta.y
})

const toEdgeNodeSnapshot = (
  node: Node
) => {
  const rect = nodeApi.geometry.rect(node)

  return {
    node,
    geometry: nodeApi.outline.geometry(
      node,
      rect,
      nodeApi.geometry.rotation(node)
    )
  }
}

const cloneEdgeEnd = (end: EdgeEnd): EdgeEnd => (
  edgeApi.guard.isNodeEnd(end)
    ? {
      ...json.clone(end),
      anchor: end.anchor ? json.clone(end.anchor) : undefined
    }
    : {
      kind: 'point',
      point: json.clone(end.point)
    }
)

const cloneNode = (node: Node): Node => {
  return {
    id: node.id,
    type: node.type,
    position: json.clone(node.position),
    size: json.clone(node.size),
    rotation: node.rotation,
    locked: node.locked,
    data: node.data ? json.clone(node.data) : undefined,
    style: node.style ? json.clone(node.style) : undefined
  }
}

const cloneEdge = (edge: Edge): Edge => ({
  ...json.clone(edge),
  locked: edge.locked,
  source: cloneEdgeEnd(edge.source),
  target: cloneEdgeEnd(edge.target),
  route: edge.route ? json.clone(edge.route) : undefined,
  style: edge.style ? json.clone(edge.style) : undefined,
  textMode: edge.textMode,
  labels: edge.labels ? json.clone(edge.labels) : undefined,
  data: edge.data ? json.clone(edge.data) : undefined
})

const remapSliceNodeInput = ({
  node,
  nextNodeId,
  nodeIdMap,
  delta
}: {
  node: Node
  nextNodeId: NodeId
  nodeIdMap: ReadonlyMap<NodeId, NodeId>
  delta: Point
}): NodeInput => ({
  ...cloneNode(node),
  position: offsetPoint(node.position, delta),
  id: nextNodeId
})

const remapEdgeEnd = ({
  end,
  nodeIdMap,
  delta
}: {
  end: EdgeEnd
  nodeIdMap: ReadonlyMap<NodeId, NodeId>
  delta: Point
}): EdgeEnd | undefined => (
  edgeApi.guard.isNodeEnd(end)
    ? (() => {
        const nodeId = nodeIdMap.get(end.nodeId)
        if (!nodeId) return undefined
        return {
          kind: 'node',
          nodeId,
          anchor: end.anchor ? json.clone(end.anchor) : undefined
        } as const
      })()
    : {
        kind: 'point',
        point: offsetPoint(end.point, delta)
      }
)

const remapEdgeRoute = (
  route: Edge['route'],
  delta: Point
): EdgeInput['route'] => (
  route?.kind === 'manual'
    ? {
        kind: 'manual',
        points: route.points.map((point) => offsetPoint(point, delta))
      }
    : route
      ? json.clone(route)
      : undefined
)

const remapSliceEdgeInput = ({
  edge,
  nextEdgeId,
  nodeIdMap,
  delta
}: {
  edge: Edge
  nextEdgeId: EdgeId
  nodeIdMap: ReadonlyMap<NodeId, NodeId>
  delta: Point
}): EdgeInput | undefined => {
  const source = remapEdgeEnd({
    end: edge.source,
    nodeIdMap,
    delta
  })
  const target = remapEdgeEnd({
    end: edge.target,
    nodeIdMap,
    delta
  })

  if (!source || !target) {
    return undefined
  }

  return {
    ...cloneEdge(edge),
    id: nextEdgeId,
    source,
    target,
    route: remapEdgeRoute(edge.route, delta)
  }
}

const collectExpandedNodeIds = (
  nodes: readonly Node[],
  selectedIds: readonly NodeId[]
) => {
  const frame = createFrameQuery({
    nodes,
    getNodeRect: (current) => nodeApi.geometry.rect(current),
    getFrameRect: (node) => (
      node.type === 'frame'
        ? nodeApi.geometry.rect(node)
        : undefined
    )
  })
  const expandedIds = new Set(dedupeIds(selectedIds))

  ;[...expandedIds].forEach((nodeId) => {
    frame.descendants(nodeId).forEach((childId) => {
      expandedIds.add(childId)
    })
  })

  return expandedIds
}

const getEdgeBounds = ({
  edge,
  nodesById
}: {
  edge: Edge
  nodesById: ReadonlyMap<NodeId, Node>
}): Rect | undefined => {
  const resolved = resolveEdgeEnds({
    edge,
    source: edgeApi.guard.isNodeEnd(edge.source)
      ? (() => {
        const node = nodesById.get(edge.source.nodeId)
        if (!node) return undefined
        return toEdgeNodeSnapshot(node)
      })()
      : undefined,
    target: edgeApi.guard.isNodeEnd(edge.target)
      ? (() => {
        const node = nodesById.get(edge.target.nodeId)
        if (!node) return undefined
        return toEdgeNodeSnapshot(node)
      })()
      : undefined
  })
  if (!resolved) return undefined

  const points: Point[] = [
    resolved.source.point,
    ...edgeApi.route.points(edge.route).map((point) => json.clone(point)),
    resolved.target.point
  ]

  return points.length > 0 ? geometryApi.rect.aabbFromPoints(points) : undefined
}

const mergeRects = (rects: readonly Rect[]): Rect | undefined => {
  if (!rects.length) return undefined

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  rects.forEach((rect) => {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  })

  if (
    !Number.isFinite(minX)
    || !Number.isFinite(minY)
    || !Number.isFinite(maxX)
    || !Number.isFinite(maxY)
  ) {
    return undefined
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  }
}

const translateNode = (
  node: Node,
  delta: Point
): Node => ({
  ...cloneNode(node),
  position: offsetPoint(node.position, delta)
})

const translateEdge = (
  edge: Edge,
  delta: Point
): Edge => ({
  ...cloneEdge(edge),
  source: edgeApi.guard.isNodeEnd(edge.source)
    ? cloneEdgeEnd(edge.source)
    : {
        kind: 'point',
        point: offsetPoint(edge.source.point, delta)
      },
  target: edgeApi.guard.isNodeEnd(edge.target)
    ? cloneEdgeEnd(edge.target)
    : {
        kind: 'point',
        point: offsetPoint(edge.target.point, delta)
      },
  route: edge.route?.kind === 'manual'
    ? {
        kind: 'manual',
        points: edge.route.points.map((point) => ({
          id: point.id,
          x: point.x + delta.x,
          y: point.y + delta.y
        }))
      }
    : edge.route
      ? {
          kind: 'auto'
        }
      : undefined
})

export const getSliceBounds = (
  slice: Slice
): Rect | undefined => {
  const nodeBounds = getNodesBoundingRect(slice.nodes)
  const nodesById = new Map<NodeId, Node>(slice.nodes.map((node) => [node.id, node]))
  const edgeBounds = slice.edges
    .map((edge) => getEdgeBounds({
      edge,
      nodesById
    }))
    .filter((rect): rect is Rect => Boolean(rect))

  return mergeRects([
    ...(nodeBounds ? [nodeBounds] : []),
    ...edgeBounds
  ])
}

export const translateSlice = (
  slice: Slice,
  delta: Point
): Slice => {
  if (delta.x === 0 && delta.y === 0) {
    return {
      version: slice.version,
      nodes: slice.nodes.map((node) => cloneNode(node)),
      edges: slice.edges.map((edge) => cloneEdge(edge))
    }
  }

  return {
    version: slice.version,
    nodes: slice.nodes.map((node) => translateNode(node, delta)),
    edges: slice.edges.map((edge) => translateEdge(edge, delta))
  }
}

const detachEdge = ({
  edge,
  doc
}: {
  edge: Edge
  doc: Document
}): Result<Edge, 'invalid'> => {
  const sourceNode = edgeApi.guard.isNodeEnd(edge.source)
    ? doc.nodes[edge.source.nodeId]
    : undefined
  const targetNode = edgeApi.guard.isNodeEnd(edge.target)
    ? doc.nodes[edge.target.nodeId]
    : undefined

  const resolved = resolveEdgeEnds({
    edge,
    source: sourceNode
      ? toEdgeNodeSnapshot(sourceNode)
      : undefined,
    target: targetNode
      ? toEdgeNodeSnapshot(targetNode)
      : undefined
  })

  if (!resolved) {
    return err('invalid', `Edge ${edge.id} could not be resolved.`)
  }

  return ok({
    ...cloneEdge(edge),
    source: {
      kind: 'point',
      point: json.clone(resolved.source.point)
    },
    target: {
      kind: 'point',
      point: json.clone(resolved.target.point)
    }
  })
}

const detachSelectionEdge = ({
  edge,
  doc,
  nodeIds
}: {
  edge: Edge
  doc: Document
  nodeIds: ReadonlySet<NodeId>
}): Result<Edge, 'invalid'> => {
  const sourceNode = edgeApi.guard.isNodeEnd(edge.source)
    ? doc.nodes[edge.source.nodeId]
    : undefined
  const targetNode = edgeApi.guard.isNodeEnd(edge.target)
    ? doc.nodes[edge.target.nodeId]
    : undefined
  const resolved = resolveEdgeEnds({
    edge,
    source: sourceNode
      ? toEdgeNodeSnapshot(sourceNode)
      : undefined,
    target: targetNode
      ? toEdgeNodeSnapshot(targetNode)
      : undefined
  })

  if (!resolved) {
    return err('invalid', `Edge ${edge.id} could not be resolved.`)
  }

  return ok({
    ...cloneEdge(edge),
    source:
      edgeApi.guard.isNodeEnd(edge.source) && nodeIds.has(edge.source.nodeId)
        ? cloneEdgeEnd(edge.source)
        : {
          kind: 'point',
          point: json.clone(resolved.source.point)
        },
    target:
      edgeApi.guard.isNodeEnd(edge.target) && nodeIds.has(edge.target.nodeId)
        ? cloneEdgeEnd(edge.target)
        : {
          kind: 'point',
          point: json.clone(resolved.target.point)
        }
  })
}

const isEdgeInsideNodeSlice = (
  edge: Edge,
  nodeIds: ReadonlySet<NodeId>
) => {
  const sourceInside = !edgeApi.guard.isNodeEnd(edge.source) || nodeIds.has(edge.source.nodeId)
  const targetInside = !edgeApi.guard.isNodeEnd(edge.target) || nodeIds.has(edge.target.nodeId)
  const touchesSelection =
    (edgeApi.guard.isNodeEnd(edge.source) && nodeIds.has(edge.source.nodeId))
    || (edgeApi.guard.isNodeEnd(edge.target) && nodeIds.has(edge.target.nodeId))

  return sourceInside && targetInside && touchesSelection
}

const withCreatedNodes = (
  doc: Document,
  operations: readonly Extract<Operation, { type: 'node.create' }>[],
  operation?: Extract<Operation, { type: 'node.create' }>
): Document => {
  const nodes = { ...doc.nodes }
  const order = [...doc.canvas.order]

  operations.forEach(({ node }) => {
    nodes[node.id] = node
    if (!order.some((ref) => ref.kind === 'node' && ref.id === node.id)) {
      order.push({
        kind: 'node',
        id: node.id
      })
    }
  })

  if (operation) {
    nodes[operation.node.id] = operation.node
    if (!order.some((ref) => ref.kind === 'node' && ref.id === operation.node.id)) {
      order.push({
        kind: 'node',
        id: operation.node.id
      })
    }
  }

  return {
    ...doc,
    nodes,
    canvas: {
      ...doc.canvas,
      order
    }
  }
}

const withCreatedEdges = (
  doc: Document,
  operations: readonly Extract<Operation, { type: 'edge.create' }>[],
  operation?: Extract<Operation, { type: 'edge.create' }>
): Document => {
  const edges = { ...doc.edges }
  const order = [...doc.canvas.order]

  operations.forEach(({ edge }) => {
    edges[edge.id] = edge
    if (!order.some((ref) => ref.kind === 'edge' && ref.id === edge.id)) {
      order.push({
        kind: 'edge',
        id: edge.id
      })
    }
  })

  if (operation) {
    edges[operation.edge.id] = operation.edge
    if (!order.some((ref) => ref.kind === 'edge' && ref.id === operation.edge.id)) {
      order.push({
        kind: 'edge',
        id: operation.edge.id
      })
    }
  }

  return {
    ...doc,
    edges,
    canvas: {
      ...doc.canvas,
      order
    }
  }
}

const readDefaultRoots = (slice: Slice): SliceRoots => {
  const nodeIds = slice.nodes.map((node) => node.id)

  if (nodeIds.length > 0) {
    return {
      nodeIds,
      edgeIds: []
    }
  }

  return {
    nodeIds: [],
    edgeIds: slice.edges.map((edge) => edge.id)
  }
}

const remapRoots = ({
  roots,
  nodeIdMap,
  edgeIdMap
}: {
  roots: SliceRoots
  nodeIdMap: ReadonlyMap<NodeId, NodeId>
  edgeIdMap: ReadonlyMap<EdgeId, EdgeId>
}): SliceRoots => ({
  nodeIds: roots.nodeIds
    .map((nodeId) => nodeIdMap.get(nodeId))
    .filter((nodeId): nodeId is NodeId => Boolean(nodeId)),
  edgeIds: roots.edgeIds
    .map((edgeId) => edgeIdMap.get(edgeId))
    .filter((edgeId): edgeId is EdgeId => Boolean(edgeId))
})

export const exportSliceFromNodes = ({
  doc,
  ids
}: ExportNodesInput): Result<SliceExportResult, 'invalid'> => {
  const selectedIds = dedupeIds(ids)
  if (!selectedIds.length) {
    return err('invalid', 'No nodes selected.')
  }

  const orderedNodes = Object.values(doc.nodes)
  const expandedIds = collectExpandedNodeIds(orderedNodes, selectedIds)
  const rawNodes = orderedNodes
    .filter((node) => expandedIds.has(node.id))
    .map((node) => cloneNode(node))

  if (!rawNodes.length) {
    return err('invalid', 'No nodes selected.')
  }

  const nodeIdSet = new Set(rawNodes.map((node) => node.id))
  const nodes = rawNodes
  const edges = Object.values(doc.edges)
    .filter((edge) => isEdgeInsideNodeSlice(edge, nodeIdSet))
    .map((edge) => cloneEdge(edge))

  const bounds = getSliceBounds({
    version: 1,
    nodes,
    edges
  })
  if (!bounds) {
    return err('invalid', 'Slice bounds could not be resolved.')
  }

  return ok({
    slice: {
      version: 1,
      nodes,
      edges
    },
    roots: {
      nodeIds: selectedIds.filter((nodeId) => nodeIdSet.has(nodeId)),
      edgeIds: []
    },
    bounds
  })
}

export const exportSliceFromEdge = ({
  doc,
  edgeId
}: ExportEdgeInput): Result<SliceExportResult, 'invalid'> => {
  const edge = doc.edges[edgeId]
  if (!edge) {
    return err('invalid', `Edge ${edgeId} not found.`)
  }

  const detached = detachEdge({
    edge,
    doc
  })
  if (!detached.ok) {
    return detached
  }

  const slice: Slice = {
    version: 1,
    nodes: [],
    edges: [detached.data]
  }
  const bounds = getSliceBounds(slice)
  if (!bounds) {
    return err('invalid', 'Slice bounds could not be resolved.')
  }

  return ok({
    slice,
    roots: {
      nodeIds: [],
      edgeIds: [edgeId]
    },
    bounds
  })
}

export const exportSliceFromSelection = ({
  doc,
  nodeIds = [],
  edgeIds = []
}: ExportSelectionInput): Result<SliceExportResult, 'invalid'> => {
  const selectedNodeIds = dedupeIds(nodeIds)
  const selectedEdgeIds = dedupeIds(edgeIds)
  if (!selectedNodeIds.length && !selectedEdgeIds.length) {
    return err('invalid', 'No selection provided.')
  }

  const orderedNodes = Object.values(doc.nodes)
  const expandedNodeIds = collectExpandedNodeIds(orderedNodes, selectedNodeIds)
  const rawNodes = orderedNodes
    .filter((node) => expandedNodeIds.has(node.id))
    .map((node) => cloneNode(node))
  const nodeIdSet = new Set(rawNodes.map((node) => node.id))
  const nodes = rawNodes

  const edges: Edge[] = []
  const includedEdgeIds = new Set<EdgeId>()

  Object.values(doc.edges).forEach((edge) => {
    if (isEdgeInsideNodeSlice(edge, nodeIdSet)) {
      edges.push(cloneEdge(edge))
      includedEdgeIds.add(edge.id)
      return
    }

    if (!selectedEdgeIds.includes(edge.id)) {
      return
    }

    const detached = detachSelectionEdge({
      edge,
      doc,
      nodeIds: nodeIdSet
    })
    if (!detached.ok) {
      return
    }

    edges.push(detached.data)
    includedEdgeIds.add(edge.id)
  })

  const slice: Slice = {
    version: 1,
    nodes,
    edges
  }
  const bounds = getSliceBounds(slice)
  if (!bounds) {
    return err('invalid', 'Slice bounds could not be resolved.')
  }

  return ok({
    slice,
    roots: {
      nodeIds: selectedNodeIds.filter((nodeId) => nodeIdSet.has(nodeId)),
      edgeIds: selectedEdgeIds.filter((edgeId) => includedEdgeIds.has(edgeId))
    },
    bounds
  })
}

export const createInsertSliceOps = ({
  doc,
  slice,
  registries,
  createNodeId = () => createId('node'),
  createEdgeId = () => createId('edge'),
  origin,
  delta,
  roots
}: InsertSliceInput): Result<SliceInsertResult, 'invalid'> => {
  if (!slice.nodes.length && !slice.edges.length) {
    return err('invalid', 'Slice is empty.')
  }

  const bounds = getSliceBounds(slice)
  if (!bounds) {
    return err('invalid', 'Slice bounds could not be resolved.')
  }

  const translation = origin
    ? {
        x: origin.x - bounds.x,
        y: origin.y - bounds.y
      }
    : delta
      ? json.clone(delta)
      : { x: 0, y: 0 }

  const normalizedRoots = toRoots(roots ?? readDefaultRoots(slice))

  const operations: Operation[] = []
  const duplicatedNodeOperations: Extract<Operation, { type: 'node.create' }>[] = []
  const duplicatedEdgeOperations: Extract<Operation, { type: 'edge.create' }>[] = []
  const nodeIdMap = new Map<NodeId, NodeId>()
  const edgeIdMap = new Map<EdgeId, EdgeId>()
  const allNodeIds: NodeId[] = []
  const allEdgeIds: EdgeId[] = []
  slice.nodes.forEach((sourceNode) => {
    nodeIdMap.set(sourceNode.id, createNodeId())
  })

  for (const sourceNode of slice.nodes) {
    const nextNodeId = nodeIdMap.get(sourceNode.id)
    if (!nextNodeId) {
      return err('invalid', `Node ${sourceNode.id} could not be remapped.`)
    }

    const planned = createNodeOp({
      payload: remapSliceNodeInput({
        node: sourceNode,
        nextNodeId,
        nodeIdMap,
        delta: translation
      }),
      doc: withCreatedNodes(doc, duplicatedNodeOperations),
      registries,
      createNodeId: () => nextNodeId
    })
    if (!planned.ok) {
      return err('invalid', planned.error.message, planned.error.details)
    }

    duplicatedNodeOperations.push(planned.data.operation)
    operations.push(planned.data.operation)
    allNodeIds.push(planned.data.nodeId)
    nodeIdMap.set(sourceNode.id, planned.data.nodeId)
  }

  const nextRootNodeIds = normalizedRoots.nodeIds
    .map((nodeId) => nodeIdMap.get(nodeId))
    .filter((nodeId): nodeId is NodeId => Boolean(nodeId))

  for (const sourceEdge of slice.edges) {
    const nextEdgeId = createEdgeId()
    const payload = remapSliceEdgeInput({
      edge: sourceEdge,
      nextEdgeId,
      nodeIdMap,
      delta: translation
    })

    if (!payload) {
      return err('invalid', `Edge ${sourceEdge.id} references nodes outside the slice.`)
    }

    const planned = createEdgeOp({
      payload,
      doc: withCreatedEdges(withCreatedNodes(doc, duplicatedNodeOperations), duplicatedEdgeOperations),
      registries,
      createEdgeId: () => nextEdgeId,
      createEdgeRoutePointId: () => createId('edge_point')
    })
    if (!planned.ok) {
      return err('invalid', planned.error.message, planned.error.details)
    }

    duplicatedEdgeOperations.push(planned.data.operation)
    operations.push(planned.data.operation)
    allEdgeIds.push(planned.data.edgeId)
    edgeIdMap.set(sourceEdge.id, planned.data.edgeId)
  }

  return ok({
    operations,
    roots: remapRoots({
      roots: normalizedRoots,
      nodeIdMap,
      edgeIdMap
    }),
    allNodeIds,
    allEdgeIds
  })
}
