import {
  isPointEqual
} from '@whiteboard/core/geometry'
import {
  sameOptionalPoint,
  sameOrder,
  samePointArray,
  sameShallowRecord
} from '@shared/core'
import { createNodeUpdateOperation } from '@whiteboard/core/node'
import { compileNodeFieldUpdate } from '@whiteboard/core/schema'
import type {
  Document,
  Edge,
  EdgeEnd,
  EdgeId,
  EdgeLabel,
  Node,
  NodeId,
  Operation,
  Point,
  Size
} from '@whiteboard/core/types'

const TEXT_WIDTH_MODE_KEY = 'widthMode'
type NodeEdgeEnd = Extract<EdgeEnd, { kind: 'node' }>

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

const isSizeEqual = (
  left?: Size,
  right?: Size
) => (
  (left?.width ?? 0) === (right?.width ?? 0)
  && (left?.height ?? 0) === (right?.height ?? 0)
)

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

const isEdgeAnchorEqual = (
  left: NodeEdgeEnd['anchor'],
  right: NodeEdgeEnd['anchor']
) => (
  left?.side === right?.side
  && (left?.offset ?? 0) === (right?.offset ?? 0)
)

const isEdgeEndEqual = (
  left: EdgeEnd,
  right: EdgeEnd
) => {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'point' && right.kind === 'point') {
    return isPointEqual(left.point, right.point)
  }

  if (left.kind === 'node' && right.kind === 'node') {
    return (
      left.nodeId === right.nodeId
      && isEdgeAnchorEqual(left.anchor, right.anchor)
    )
  }

  return false
}

const isEdgeRouteEqual = (
  left: Edge['route'],
  right: Edge['route']
) => (
  left?.kind === right?.kind
  && isPointArrayEqual(
    left?.kind === 'manual' ? left.points : undefined,
    right?.kind === 'manual' ? right.points : undefined
  )
)

const isEdgeLabelEqual = (
  left?: EdgeLabel,
  right?: EdgeLabel
) => (
  left?.id === right?.id
  && left?.text === right?.text
  && left?.t === right?.t
  && left?.offset === right?.offset
  && left?.style?.size === right?.style?.size
  && left?.style?.weight === right?.style?.weight
  && left?.style?.italic === right?.style?.italic
  && left?.style?.color === right?.style?.color
  && left?.style?.bg === right?.style?.bg
)

const isEdgeLabelsEqual = (
  left?: readonly EdgeLabel[],
  right?: readonly EdgeLabel[]
) => {
  if (left === right) {
    return true
  }
  if (!left || !right || left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!isEdgeLabelEqual(left[index], right[index])) {
      return false
    }
  }

  return true
}

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
    !isEdgeEndEqual(before.source, after.source)
    || !isEdgeEndEqual(before.target, after.target)
    || before.type !== after.type
    || !isEdgeRouteEqual(before.route, after.route)
  )
  const value = (
    !isShallowEqual(before.style, after.style)
    || before.textMode !== after.textMode
    || !isEdgeLabelsEqual(before.labels, after.labels)
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

const hasNodeSizeChange = (
  change: NodeChange
) => {
  if (!change.before || !change.after) {
    return false
  }

  const before = readNodeGeometry(change.before)?.size
  const after = readNodeGeometry(change.after)?.size
  if (!before && !after) {
    return false
  }

  return (
    (before?.width ?? 0) !== (after?.width ?? 0)
    || (before?.height ?? 0) !== (after?.height ?? 0)
  )
}

const collectNodeDataOps = ({
  document,
  changes,
  nodeSize: _nodeSize
}: {
  document: Document
  changes: WriteChanges
  nodeSize: Size
}): Operation[] => {
  const next: Operation[] = []

  changes.nodes.forEach((change, nodeId) => {
    if (!change.after || !change.geometry) {
      return
    }

    const node = document.nodes[nodeId]
    if (!node) {
      return
    }

    let data = node.data

    if (node.type === 'text' && hasNodeSizeChange(change)) {
      if (node.data?.[TEXT_WIDTH_MODE_KEY] !== 'fixed') {
        data = {
          ...(data ?? {}),
          [TEXT_WIDTH_MODE_KEY]: 'fixed'
        }
      }
    }

    if (isShallowEqual(node.data, data)) {
      return
    }

    next.push(createNodeUpdateOperation(
      nodeId,
      compileNodeFieldUpdate(
        { scope: 'data', path: TEXT_WIDTH_MODE_KEY },
        'fixed'
      )
    ))
  })

  return next
}

export const collectFinalizeOps = ({
  afterDocument,
  changes,
  nodeSize
}: {
  afterDocument: Document
  changes: WriteChanges
  nodeSize: Size
}): Operation[] => {
  return collectNodeDataOps({
    document: afterDocument,
    changes,
    nodeSize
  })
}

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
