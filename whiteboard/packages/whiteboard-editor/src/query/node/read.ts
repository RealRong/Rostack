import {
  type NodeRectHitOptions,
  type TransformSelectionTargets
} from '@whiteboard/core/node'
import type {
  EngineRead,
  NodeItem
} from '@whiteboard/engine'
import {
  createKeyedDerivedStore,
  read as readValue,
  type KeyedReadStore,
  sameRect,
  sameOptionalRect as isSameOptionalRectTuple,
  samePointArray as isSamePointArray,
  type ReadStore
} from '@shared/core'
import type {
  NodeGeometry,
  Node,
  NodeId,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type {
  NodeDefinition,
  NodeRegistry,
  NodeRole
} from '../../types/node'
import type {
  NodeOverlayProjection,
} from '../../local/feedback/types'
import type { EditSession } from '../../local/session/edit'
import {
  projectNodeItem,
  readNodeProjectionRotation,
  readProjectedNodeBounds,
  readProjectedNodeGeometry
} from './projection'
import { readPresentValues } from '../utils'

export type NodeRuntimeState = {
  hovered: boolean
  hidden: boolean
  patched: boolean
  resizing: boolean
}

export type NodeCapability = {
  role: NodeRole
  connect: boolean
  enter: boolean
  resize: boolean
  rotate: boolean
}

export type NodeView = {
  nodeId: NodeId
  node: NodeItem['node']
  rect: NodeItem['rect']
  frameRect: NodeItem['rect']
  rotation: number
  hovered: boolean
  hidden: boolean
  resizing: boolean
  patched: boolean
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
}

export type NodeCanvasSnapshot = {
  node: Node
  geometry: ReturnType<typeof readProjectedNodeGeometry>
}

export type NodeRead = {
  list: EngineRead['node']['list']
  committed: EngineRead['node']['item']
  item: KeyedReadStore<NodeId, NodeItem | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly Node[]
  state: KeyedReadStore<NodeId, NodeRuntimeState>
  view: KeyedReadStore<NodeId, NodeView | undefined>
  canvas: KeyedReadStore<NodeId, NodeCanvasSnapshot | undefined>
  rect: KeyedReadStore<NodeId, Rect | undefined>
  bounds: KeyedReadStore<NodeId, Rect | undefined>
  capability: (node: Pick<Node, 'type'> | NodeType) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  transformTargets: (
    nodeIds: readonly NodeId[]
  ) => TransformSelectionTargets<Node> | undefined
  ordered: () => readonly Node[]
}

const readNodeType = (
  node: Pick<Node, 'type'> | NodeType
) => (
  typeof node === 'string'
    ? node
    : node.type
)

const isNodeItemEqual = (
  left: NodeItem | undefined,
  right: NodeItem | undefined
) => (
  left === right
  || (
    left?.node === right?.node
    && left?.rect.x === right?.rect.x
    && left?.rect.y === right?.rect.y
    && left?.rect.width === right?.rect.width
    && left?.rect.height === right?.rect.height
  )
)

const isNodeStateEqual = (
  left: NodeRuntimeState,
  right: NodeRuntimeState
) => (
  left.hovered === right.hovered
  && left.hidden === right.hidden
  && left.patched === right.patched
  && left.resizing === right.resizing
)

const isNodeViewEqual = (
  left: NodeView | undefined,
  right: NodeView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.node === right.node
    && sameRect(left.rect, right.rect)
    && sameRect(left.frameRect, right.frameRect)
    && left.rotation === right.rotation
    && left.hovered === right.hovered
    && left.hidden === right.hidden
    && left.resizing === right.resizing
    && left.patched === right.patched
    && left.canConnect === right.canConnect
    && left.canResize === right.canResize
    && left.canRotate === right.canRotate
  )
)

const isNodeGeometryEqual = (
  left: NodeGeometry,
  right: NodeGeometry
) => (
  sameRect(left.rect, right.rect)
  && sameRect(left.bounds, right.bounds)
  && left.outline.kind === right.outline.kind
  && (
    left.outline.kind === 'rect' && right.outline.kind === 'rect'
      ? (
          sameRect(left.outline.rect, right.outline.rect)
          && left.outline.rotation === right.outline.rotation
        )
      : left.outline.kind === 'polygon' && right.outline.kind === 'polygon'
        ? isSamePointArray(left.outline.points, right.outline.points)
        : false
  )
)

const isNodeCanvasSnapshotEqual = (
  left: NodeCanvasSnapshot | undefined,
  right: NodeCanvasSnapshot | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.node === right.node
    && isNodeGeometryEqual(left.geometry, right.geometry)
  )
)

const resolveNodeCapability = (
  definition?: NodeDefinition
): NodeCapability => {
  const role = definition?.role ?? 'content'

  return {
    role,
    connect: definition?.connect ?? true,
    enter: definition?.enter ?? false,
    resize: definition?.canResize ?? true,
    rotate:
      typeof definition?.canRotate === 'boolean'
        ? definition.canRotate
        : role === 'content'
  }
}

const toNodeView = (
  nodeId: NodeId,
  item: NodeItem,
  state: NodeRuntimeState,
  capability: NodeCapability
): NodeView => {
  const rotation = readNodeProjectionRotation(item.node)

  return {
    nodeId,
    node: item.node,
    rect: item.rect,
    frameRect: item.rect,
    rotation,
    hovered: state.hovered,
    hidden: state.hidden,
    resizing: state.resizing,
    patched: state.patched,
    canConnect: capability.connect,
    canResize: capability.resize,
    canRotate: capability.rotate
  }
}

const getNodeItemBounds = (
  item: NodeItem
): Rect => readProjectedNodeBounds(item)

const readNodeItemGeometry = (
  item: NodeItem
): ReturnType<typeof readProjectedNodeGeometry> => readProjectedNodeGeometry(item)

const toNodeRuntimeState = (
  projection: NodeOverlayProjection
): NodeRuntimeState => ({
  hovered: projection.hovered,
  hidden: projection.hidden,
  patched: Boolean(projection.patch || projection.text),
  resizing: Boolean(
    projection.patch?.size
    || projection.text?.handle
    || projection.text?.size
    || projection.text?.position
  )
})

export const createNodeRead = ({
  read,
  registry,
  overlay,
  edit
}: {
  read: EngineRead
  registry: NodeRegistry
  overlay: KeyedReadStore<NodeId, NodeOverlayProjection>
  edit: ReadStore<EditSession>
}): NodeRead => {
  const item: NodeRead['item'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = readValue(read.node.item, nodeId)
      if (!current) {
        return undefined
      }

      return projectNodeItem(
        current,
        readValue(overlay, nodeId),
        readValue(edit)
      )
    },
    isEqual: isNodeItemEqual
  })
  const state: NodeRead['state'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => toNodeRuntimeState(
      readValue(overlay, nodeId)
    ),
    isEqual: isNodeStateEqual
  })
  const capability: NodeRead['capability'] = (
    node: Pick<Node, 'type'> | NodeType
  ) => resolveNodeCapability(
    registry.get(readNodeType(node))
  )
  const view: NodeRead['view'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const resolvedItem = readValue(item, nodeId)
      if (!resolvedItem) {
        return undefined
      }

      return toNodeView(
        nodeId,
        resolvedItem,
        readValue(state, nodeId),
        capability(resolvedItem.node)
      )
    },
    isEqual: isNodeViewEqual
  })
  const canvas: NodeRead['canvas'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const resolvedItem = readValue(item, nodeId)
      if (!resolvedItem) {
        return undefined
      }

      return {
        node: resolvedItem.node,
        geometry: readNodeItemGeometry(resolvedItem)
      }
    },
    isEqual: isNodeCanvasSnapshotEqual
  })
  const rect: NodeRead['rect'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => readValue(item, nodeId)?.rect,
    isEqual: isSameOptionalRectTuple
  })
  const bounds: NodeRead['bounds'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const resolvedItem = readValue(item, nodeId)
      return resolvedItem
        ? getNodeItemBounds(resolvedItem)
        : undefined
    },
    isEqual: isSameOptionalRectTuple
  })

  return {
    list: read.node.list,
    committed: read.node.item,
    item,
    nodes: (nodeIds) => readPresentValues(nodeIds, (nodeId) => readValue(item, nodeId)?.node),
    state,
    view,
    canvas,
    rect,
    bounds,
    capability,
    idsInRect: read.node.idsInRect,
    transformTargets: read.node.transformTargets,
    ordered: () => readPresentValues(readValue(read.node.list), (nodeId) => readValue(item, nodeId)?.node)
  }
}
