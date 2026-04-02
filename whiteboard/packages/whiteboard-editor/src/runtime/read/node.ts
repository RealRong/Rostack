import {
  applyNodeProjectionPatch,
  applyNodeProjectionRect,
  getNodeOutlineBounds,
  getNodeOutlineRect,
  resolveNodeConnect,
  resolveNodeRole,
  resolveNodeTransform,
  type NodeRole,
  type NodeRectHitOptions,
  type TransformSelectionTargets
} from '@whiteboard/core/node'
import type {
  EngineRead,
  KeyedReadStore,
  NodeItem
} from '@whiteboard/engine'
import type {
  Node,
  NodeId,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type { NodeRegistry } from '../../types/node'
import {
  getAABBFromPoints,
  getRotatedCorners
} from '@whiteboard/core/geometry'
import type {
  NodeOverlayProjection
} from '../overlay'
import {
  createOverlayStateStore,
  createPatchedItemStore
} from './keyed'

export type NodeRuntimeState = {
  hovered: boolean
  hidden: boolean
  patched: boolean
  resizing: boolean
}

export type NodeCapability = {
  role: NodeRole
  connect: boolean
  resize: boolean
  rotate: boolean
}

export type NodeRead = {
  list: EngineRead['node']['list']
  item: KeyedReadStore<NodeId, NodeItem | undefined>
  state: KeyedReadStore<NodeId, NodeRuntimeState>
  owner: (nodeId: NodeId) => NodeId | undefined
  outline: (nodeId: NodeId) => Rect | undefined
  capability: (node: Pick<Node, 'type'> | NodeType) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  transformTargets: (
    nodeIds: readonly NodeId[]
  ) => TransformSelectionTargets<Node> | undefined
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

const readNodeRotation = (
  node: NodeItem['node']
) => (
  node.type === 'group'
    ? 0
    : (typeof node.rotation === 'number' ? node.rotation : 0)
)

export const getNodeItemBounds = (
  item: NodeItem
): Rect => {
  const rotation = readNodeRotation(item.node)

  if (item.node.type === 'group') {
    return item.rect
  }

  if (item.node.type === 'shape') {
    return getNodeOutlineBounds(item.node, item.rect, rotation)
  }

  return rotation === 0
    ? item.rect
    : getAABBFromPoints(getRotatedCorners(item.rect, rotation))
}

const readNodeItemOutline = (
  item: NodeItem
): Rect => item.node.type === 'shape'
  ? getNodeOutlineRect(item.node, item.rect)
  : item.rect

const toNodeRuntimeState = (
  projection: NodeOverlayProjection
): NodeRuntimeState => ({
  hovered: projection.hovered,
  hidden: projection.hidden,
  patched: Boolean(projection.patch),
  resizing: Boolean(projection.patch?.size)
})

const createNodeItemStore = ({
  read,
  overlay
}: {
  read: Pick<EngineRead, 'node'>
  overlay: KeyedReadStore<NodeId, NodeOverlayProjection>
}): NodeRead['item'] => createPatchedItemStore({
  source: read.node.item,
  overlay,
  project: (item, projection) => {
    const patch = projection.patch
    if (!patch) {
      return item
    }

    const node = applyNodeProjectionPatch(item.node, patch)
    const rect = applyNodeProjectionRect(item.rect, patch)
    return node === item.node && rect === item.rect
      ? item
      : {
          node,
          rect
        }
  },
  isEqual: isNodeItemEqual
})

const createNodeStateStore = ({
  overlay
}: {
  overlay: KeyedReadStore<NodeId, NodeOverlayProjection>
}): NodeRead['state'] => createOverlayStateStore({
  overlay,
  project: toNodeRuntimeState,
  isEqual: isNodeStateEqual
})

const createNodeCapabilityResolver = (
  registry: NodeRegistry
): NodeRead['capability'] => (
  node: Pick<Node, 'type'> | NodeType
) => {
  const definition = registry.get(readNodeType(node))
  const transform = resolveNodeTransform(definition)

  return {
    role: resolveNodeRole(definition),
    connect: resolveNodeConnect(definition),
    resize: transform.resize,
    rotate: transform.rotate
  }
}

export const createNodeRead = ({
  read,
  registry,
  overlay
}: {
  read: EngineRead
  registry: NodeRegistry
  overlay: KeyedReadStore<NodeId, NodeOverlayProjection>
}): NodeRead => {
  const item = createNodeItemStore({
    read,
    overlay
  })
  const state = createNodeStateStore({
    overlay
  })
  const capability = createNodeCapabilityResolver(registry)

  return {
    list: read.node.list,
    item,
    state,
    owner: read.node.owner,
    outline: (nodeId) => {
      const nextItem = item.get(nodeId)
      return nextItem
        ? readNodeItemOutline(nextItem)
        : undefined
    },
    capability,
    idsInRect: read.node.idsInRect,
    transformTargets: read.node.transformTargets
  }
}
