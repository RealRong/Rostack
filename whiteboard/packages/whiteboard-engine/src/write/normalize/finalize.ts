import {
  sameEdgeEnd,
  sameEdgeLabels,
  sameEdgeRoute
} from '@whiteboard/core/edge'
import {
  isSizeEqual
} from '@whiteboard/core/geometry'
import {
  sameOptionalPoint,
  sameOrder,
  samePointArray,
  sameShallowRecord
} from '@shared/core'
import type {
  Document,
  Edge,
  EdgeId,
  Node,
  NodeId,
  Operation,
  Point,
  Size
} from '@whiteboard/core/types'

type NodeChange = {
  before?: Node
  after?: Node
  geometry: boolean
  relation: boolean
  value: boolean
}

type EdgeChange = {
  before?: Edge
  after?: Edge
  geometry: boolean
  value: boolean
}

type WriteChanges = {
  nodes: ReadonlyMap<NodeId, NodeChange>
  edges: ReadonlyMap<EdgeId, EdgeChange>
}

type TouchedIds = {
  nodeIds: ReadonlySet<NodeId>
  edgeIds: ReadonlySet<EdgeId>
}

const readNodeGeometry = (
  node: Node | undefined
): {
  position?: Point
  size?: Size
  rotation?: number
} | undefined => (
  node
    ? {
        position: node.position,
        size: node.size,
        rotation: node.rotation
      }
    : undefined
)

const collectTouchedIds = (
  operations: readonly Operation[]
): TouchedIds => {
  const nodeIds = new Set<NodeId>()
  const edgeIds = new Set<EdgeId>()

  operations.forEach((operation) => {
    switch (operation.type) {
      case 'node.create':
        nodeIds.add(operation.node.id)
        return
      case 'node.update':
      case 'node.delete':
        nodeIds.add(operation.id)
        return
      case 'edge.create':
        edgeIds.add(operation.edge.id)
        return
      case 'edge.update':
      case 'edge.delete':
        edgeIds.add(operation.id)
        return
      default:
        return
    }
  })

  return {
    nodeIds,
    edgeIds
  }
}

const isRotationEqual = (
  left?: number,
  right?: number
) => (left ?? 0) === (right ?? 0)

const isArrayEqual = sameOrder

const isPointOptionalEqual = (
  left?: Point,
  right?: Point
) => sameOptionalPoint(left, right)

const isPointArrayEqual = (
  left: readonly Point[] | undefined,
  right: readonly Point[] | undefined
) => samePointArray(left, right)

const isShallowEqual = (
  left: object | undefined,
  right: object | undefined
) => sameShallowRecord(left, right)

const diffNodeChange = (
  before: Node | undefined,
  after: Node | undefined
): NodeChange | undefined => {
  if (!before && !after) {
    return undefined
  }

  if (!before || !after) {
    return {
      before,
      after,
      geometry: true,
      relation: true,
      value: true
    }
  }

  const beforeGeometry = readNodeGeometry(before)
  const afterGeometry = readNodeGeometry(after)
  const geometry = (
    !isPointOptionalEqual(beforeGeometry?.position, afterGeometry?.position)
    || !isSizeEqual(beforeGeometry?.size, afterGeometry?.size)
    || !isRotationEqual(beforeGeometry?.rotation, afterGeometry?.rotation)
  )
  const relation = (
    before.type !== after.type
  )
  const value = (
    before.layer !== after.layer
    || before.zIndex !== after.zIndex
    || before.locked !== after.locked
    || !isShallowEqual(before.data, after.data)
    || !isShallowEqual(before.style, after.style)
  )

  if (!geometry && !relation && !value) {
    return undefined
  }

  return {
    before,
    after,
    geometry,
    relation,
    value
  }
}

const diffEdgeChange = (
  before: Edge | undefined,
  after: Edge | undefined
): EdgeChange | undefined => {
  if (!before && !after) {
    return undefined
  }

  if (!before || !after) {
    return {
      before,
      after,
      geometry: true,
      value: true
    }
  }

  const geometry = (
    !sameEdgeEnd(before.source, after.source)
    || !sameEdgeEnd(before.target, after.target)
    || before.type !== after.type
    || !sameEdgeRoute(before.route, after.route)
  )
  const value = (
    !isShallowEqual(before.style, after.style)
    || before.textMode !== after.textMode
    || !sameEdgeLabels(before.labels, after.labels)
    || !isShallowEqual(before.data, after.data)
  )

  if (!geometry && !value) {
    return undefined
  }

  return {
    before,
    after,
    geometry,
    value
  }
}

const diffChanges = ({
  beforeDocument,
  afterDocument,
  touched
}: {
  beforeDocument: Document
  afterDocument: Document
  touched: TouchedIds
}): WriteChanges => {
  const nodes = new Map<NodeId, NodeChange>()
  touched.nodeIds.forEach((nodeId) => {
    const change = diffNodeChange(
      beforeDocument.nodes[nodeId],
      afterDocument.nodes[nodeId]
    )
    if (change) {
      nodes.set(nodeId, change)
    }
  })

  const edges = new Map<EdgeId, EdgeChange>()
  touched.edgeIds.forEach((edgeId) => {
    const change = diffEdgeChange(
      beforeDocument.edges[edgeId],
      afterDocument.edges[edgeId]
    )
    if (change) {
      edges.set(edgeId, change)
    }
  })

  return {
    nodes,
    edges
  }
}

export const collectChanges = ({
  beforeDocument,
  afterDocument,
  operations
}: {
  beforeDocument: Document
  afterDocument: Document
  operations: readonly Operation[]
}): WriteChanges => diffChanges({
  beforeDocument,
  afterDocument,
  touched: collectTouchedIds(operations)
})

export const collectFinalizeOps = ({
  afterDocument: _afterDocument,
  changes: _changes,
  nodeSize: _nodeSize
}: {
  afterDocument: Document
  changes: WriteChanges
  nodeSize: Size
}): Operation[] => []

export const collectDirtyNodeIds = (
  changes: WriteChanges
): ReadonlySet<NodeId> => {
  const nodeIds = new Set<NodeId>()

  changes.nodes.forEach((change, nodeId) => {
    if (!change.geometry && !change.relation) {
      return
    }

    if (change.after) {
      nodeIds.add(nodeId)
    }
  })

  return nodeIds
}
