import { buildEdgeCreateOperation } from '#whiteboard-core/edge/commands'
import { isNodeEdgeEnd, readEdgeRoutePoints } from '#whiteboard-core/edge'
import { resolveEdgeEnds } from '#whiteboard-core/edge/endpoints'
import { getAABBFromPoints, getRectCenter } from '#whiteboard-core/geometry'
import { getNodeGeometry, getNodeRect, readNodeRotation } from '#whiteboard-core/node'
import { getNodesBoundingRect } from '#whiteboard-core/node/group'
import { expandFrameSelection } from '#whiteboard-core/node/frame'
import { buildNodeCreateOperation } from '#whiteboard-core/node/commands'
import { createId } from '#whiteboard-core/id'
import { err, ok } from '#whiteboard-core/result'
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
  Result,
  Size,
  SpatialNode
} from '#whiteboard-core/types'
import type {
  Slice,
  SliceExportResult,
  SliceInsertOptions,
  SliceInsertResult,
  SliceRoots
} from '#whiteboard-core/types/document'
import { getEdge, getNode, listEdges, listNodes } from '#whiteboard-core/document'
import { cloneValue } from '#whiteboard-core/value'

type ExportNodesInput = {
  doc: Document
  ids: readonly NodeId[]
  nodeSize: Size
}

type ExportEdgeInput = {
  doc: Document
  edgeId: EdgeId
  nodeSize: Size
}

type ExportSelectionInput = {
  doc: Document
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
  nodeSize: Size
}

type InsertSliceInput = {
  doc: Document
  slice: Slice
  nodeSize: Size
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
  node: SpatialNode,
  nodeSize: Size
) => {
  const rect = getNodeRect(node, nodeSize)

  return {
    node,
    geometry: getNodeGeometry(
      node,
      rect,
      readNodeRotation(node)
    )
  }
}

const cloneEdgeEnd = (end: EdgeEnd): EdgeEnd => (
  isNodeEdgeEnd(end)
    ? {
      ...cloneValue(end),
      anchor: end.anchor ? cloneValue(end.anchor) : undefined
    }
    : {
      kind: 'point',
      point: cloneValue(end.point)
    }
)

const cloneNode = (node: Node): Node => {
  return {
    id: node.id,
    type: node.type,
    position: cloneValue(node.position),
    size: node.size ? cloneValue(node.size) : undefined,
    rotation: node.rotation,
    layer: node.layer,
    zIndex: node.zIndex,
    locked: node.locked,
    data: node.data ? cloneValue(node.data) : undefined,
    style: node.style ? cloneValue(node.style) : undefined
  }
}

const cloneEdge = (edge: Edge): Edge => ({
  ...cloneValue(edge),
  source: cloneEdgeEnd(edge.source),
  target: cloneEdgeEnd(edge.target),
  route: edge.route ? cloneValue(edge.route) : undefined,
  style: edge.style ? cloneValue(edge.style) : undefined,
  textMode: edge.textMode,
  labels: edge.labels ? cloneValue(edge.labels) : undefined,
  data: edge.data ? cloneValue(edge.data) : undefined
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

const readSpatialNode = (
  node: Node | undefined
): SpatialNode | undefined => node

const remapEdgeEnd = ({
  end,
  nodeIdMap,
  delta
}: {
  end: EdgeEnd
  nodeIdMap: ReadonlyMap<NodeId, NodeId>
  delta: Point
}): EdgeEnd | undefined => (
  isNodeEdgeEnd(end)
    ? (() => {
        const nodeId = nodeIdMap.get(end.nodeId)
        if (!nodeId) return undefined
        return {
          kind: 'node',
          nodeId,
          anchor: end.anchor ? cloneValue(end.anchor) : undefined
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
      ? cloneValue(route)
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
  selectedIds: readonly NodeId[],
  nodeSize: Size
) => {
  const nodeById = new Map<NodeId, Node>(nodes.map((node) => [node.id, node]))
  const expandedIds = new Set<NodeId>()
  const stack = dedupeIds(selectedIds)

  while (stack.length) {
    const nodeId = stack.pop()
    if (!nodeId || expandedIds.has(nodeId)) continue

    const node = nodeById.get(nodeId)
    if (!node) continue

    expandedIds.add(nodeId)
  }

  return expandFrameSelection({
    nodes,
    ids: [...expandedIds],
    getNodeRect: (node) => getNodeRect(node, nodeSize),
    getFrameRect: (node) => (
      node.type === 'frame'
        ? getNodeRect(node, nodeSize)
        : undefined
    )
  })
}

const getEdgeBounds = ({
  edge,
  nodesById,
  nodeSize
}: {
  edge: Edge
  nodesById: ReadonlyMap<NodeId, Node>
  nodeSize: Size
}): Rect | undefined => {
  const resolved = resolveEdgeEnds({
    edge,
    source: isNodeEdgeEnd(edge.source)
      ? (() => {
        const node = readSpatialNode(nodesById.get(edge.source.nodeId))
        if (!node) return undefined
        return toEdgeNodeSnapshot(node, nodeSize)
      })()
      : undefined,
    target: isNodeEdgeEnd(edge.target)
      ? (() => {
        const node = readSpatialNode(nodesById.get(edge.target.nodeId))
        if (!node) return undefined
        return toEdgeNodeSnapshot(node, nodeSize)
      })()
      : undefined
  })
  if (!resolved) return undefined

  const points: Point[] = [
    resolved.source.point,
    ...readEdgeRoutePoints(edge.route).map((point) => cloneValue(point)),
    resolved.target.point
  ]

  return points.length > 0 ? getAABBFromPoints(points) : undefined
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
  source: isNodeEdgeEnd(edge.source)
    ? cloneEdgeEnd(edge.source)
    : {
        kind: 'point',
        point: offsetPoint(edge.source.point, delta)
      },
  target: isNodeEdgeEnd(edge.target)
    ? cloneEdgeEnd(edge.target)
    : {
        kind: 'point',
        point: offsetPoint(edge.target.point, delta)
      },
  route: remapEdgeRoute(edge.route, delta)
})

export const getSliceBounds = (
  slice: Slice,
  nodeSize: Size
): Rect | undefined => {
  const nodeBounds = getNodesBoundingRect(slice.nodes, nodeSize)
  const nodesById = new Map<NodeId, Node>(slice.nodes.map((node) => [node.id, node]))
  const edgeBounds = slice.edges
    .map((edge) => getEdgeBounds({
      edge,
      nodesById,
      nodeSize
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
  doc,
  nodeSize
}: {
  edge: Edge
  doc: Document
  nodeSize: Size
}): Result<Edge, 'invalid'> => {
  const sourceNode = isNodeEdgeEnd(edge.source)
    ? readSpatialNode(getNode(doc, edge.source.nodeId))
    : undefined
  const targetNode = isNodeEdgeEnd(edge.target)
    ? readSpatialNode(getNode(doc, edge.target.nodeId))
    : undefined

  const resolved = resolveEdgeEnds({
    edge,
    source: sourceNode
      ? toEdgeNodeSnapshot(sourceNode, nodeSize)
      : undefined,
    target: targetNode
      ? toEdgeNodeSnapshot(targetNode, nodeSize)
      : undefined
  })

  if (!resolved) {
    return err('invalid', `Edge ${edge.id} could not be resolved.`)
  }

  return ok({
    ...cloneEdge(edge),
    source: {
      kind: 'point',
      point: cloneValue(resolved.source.point)
    },
    target: {
      kind: 'point',
      point: cloneValue(resolved.target.point)
    }
  })
}

const detachSelectionEdge = ({
  edge,
  doc,
  nodeIds,
  nodeSize
}: {
  edge: Edge
  doc: Document
  nodeIds: ReadonlySet<NodeId>
  nodeSize: Size
}): Result<Edge, 'invalid'> => {
  const sourceNode = isNodeEdgeEnd(edge.source)
    ? readSpatialNode(getNode(doc, edge.source.nodeId))
    : undefined
  const targetNode = isNodeEdgeEnd(edge.target)
    ? readSpatialNode(getNode(doc, edge.target.nodeId))
    : undefined
  const resolved = resolveEdgeEnds({
    edge,
    source: sourceNode
      ? toEdgeNodeSnapshot(sourceNode, nodeSize)
      : undefined,
    target: targetNode
      ? toEdgeNodeSnapshot(targetNode, nodeSize)
      : undefined
  })

  if (!resolved) {
    return err('invalid', `Edge ${edge.id} could not be resolved.`)
  }

  return ok({
    ...cloneEdge(edge),
    source:
      isNodeEdgeEnd(edge.source) && nodeIds.has(edge.source.nodeId)
        ? cloneEdgeEnd(edge.source)
        : {
          kind: 'point',
          point: cloneValue(resolved.source.point)
        },
    target:
      isNodeEdgeEnd(edge.target) && nodeIds.has(edge.target.nodeId)
        ? cloneEdgeEnd(edge.target)
        : {
          kind: 'point',
          point: cloneValue(resolved.target.point)
        }
  })
}

const isEdgeInsideNodeSlice = (
  edge: Edge,
  nodeIds: ReadonlySet<NodeId>
) => {
  const sourceInside = !isNodeEdgeEnd(edge.source) || nodeIds.has(edge.source.nodeId)
  const targetInside = !isNodeEdgeEnd(edge.target) || nodeIds.has(edge.target.nodeId)
  const touchesSelection =
    (isNodeEdgeEnd(edge.source) && nodeIds.has(edge.source.nodeId))
    || (isNodeEdgeEnd(edge.target) && nodeIds.has(edge.target.nodeId))

  return sourceInside && targetInside && touchesSelection
}

const withCreatedNodes = (
  doc: Document,
  operations: readonly Extract<Operation, { type: 'node.create' }>[],
  operation?: Extract<Operation, { type: 'node.create' }>
): Document => {
  const nodes = { ...doc.nodes }
  const order = [...doc.order]

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
    order
  }
}

const withCreatedEdges = (
  doc: Document,
  operations: readonly Extract<Operation, { type: 'edge.create' }>[],
  operation?: Extract<Operation, { type: 'edge.create' }>
): Document => {
  const edges = { ...doc.edges }
  const order = [...doc.order]

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
    order
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
  ids,
  nodeSize
}: ExportNodesInput): Result<SliceExportResult, 'invalid'> => {
  const selectedIds = dedupeIds(ids)
  if (!selectedIds.length) {
    return err('invalid', 'No nodes selected.')
  }

  const orderedNodes = listNodes(doc)
  const expandedIds = collectExpandedNodeIds(orderedNodes, selectedIds, nodeSize)
  const rawNodes = orderedNodes
    .filter((node) => expandedIds.has(node.id))
    .map((node) => cloneNode(node))

  if (!rawNodes.length) {
    return err('invalid', 'No nodes selected.')
  }

  const nodeIdSet = new Set(rawNodes.map((node) => node.id))
  const nodes = rawNodes
  const edges = listEdges(doc)
    .filter((edge) => isEdgeInsideNodeSlice(edge, nodeIdSet))
    .map((edge) => cloneEdge(edge))

  const bounds = getSliceBounds({
    version: 1,
    nodes,
    edges
  }, nodeSize)
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
  edgeId,
  nodeSize
}: ExportEdgeInput): Result<SliceExportResult, 'invalid'> => {
  const edge = getEdge(doc, edgeId)
  if (!edge) {
    return err('invalid', `Edge ${edgeId} not found.`)
  }

  const detached = detachEdge({
    edge,
    doc,
    nodeSize
  })
  if (!detached.ok) {
    return detached
  }

  const slice: Slice = {
    version: 1,
    nodes: [],
    edges: [detached.data]
  }
  const bounds = getSliceBounds(slice, nodeSize)
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
  edgeIds = [],
  nodeSize
}: ExportSelectionInput): Result<SliceExportResult, 'invalid'> => {
  const selectedNodeIds = dedupeIds(nodeIds)
  const selectedEdgeIds = dedupeIds(edgeIds)
  if (!selectedNodeIds.length && !selectedEdgeIds.length) {
    return err('invalid', 'No selection provided.')
  }

  const orderedNodes = listNodes(doc)
  const expandedNodeIds = collectExpandedNodeIds(orderedNodes, selectedNodeIds, nodeSize)
  const rawNodes = orderedNodes
    .filter((node) => expandedNodeIds.has(node.id))
    .map((node) => cloneNode(node))
  const nodeIdSet = new Set(rawNodes.map((node) => node.id))
  const nodes = rawNodes

  const edges: Edge[] = []
  const includedEdgeIds = new Set<EdgeId>()

  listEdges(doc).forEach((edge) => {
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
      nodeIds: nodeIdSet,
      nodeSize
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
  const bounds = getSliceBounds(slice, nodeSize)
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

export const buildInsertSliceOperations = ({
  doc,
  slice,
  nodeSize,
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

  const bounds = getSliceBounds(slice, nodeSize)
  if (!bounds) {
    return err('invalid', 'Slice bounds could not be resolved.')
  }

  const translation = origin
    ? {
        x: origin.x - bounds.x,
        y: origin.y - bounds.y
      }
    : delta
      ? cloneValue(delta)
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

    const planned = buildNodeCreateOperation({
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

    const planned = buildEdgeCreateOperation({
      payload,
      doc: withCreatedEdges(withCreatedNodes(doc, duplicatedNodeOperations), duplicatedEdgeOperations),
      registries,
      createEdgeId: () => nextEdgeId
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
