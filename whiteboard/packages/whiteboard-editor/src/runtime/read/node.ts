import {
  applyNodeProjectionPatch,
  applyNodeProjectionRect,
  getNodeBounds,
  getNodeGeometry,
  readTextWidthMode,
  resolveNodeConnect,
  resolveNodeEnter,
  resolveNodeRole,
  resolveNodeTransform,
  setTextWidthMode,
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
  NodeGeometry,
  Node,
  NodeId,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type { NodeRegistry } from '../../types/node'
import type {
  NodeOverlayProjection
} from '../overlay/types'
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
  enter: boolean
  resize: boolean
  rotate: boolean
}

export type NodeRead = {
  list: EngineRead['node']['list']
  item: KeyedReadStore<NodeId, NodeItem | undefined>
  state: KeyedReadStore<NodeId, NodeRuntimeState>
  owner: (nodeId: NodeId) => NodeId | undefined
  geometry: (nodeId: NodeId) => NodeGeometry | undefined
  rect: (nodeId: NodeId) => Rect | undefined
  bounds: (nodeId: NodeId) => Rect | undefined
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
): Rect => getNodeBounds(item.node, item.rect, readNodeRotation(item.node))

const readNodeItemGeometry = (
  item: NodeItem
): NodeGeometry => getNodeGeometry(
  item.node,
  item.rect,
  readNodeRotation(item.node)
)

const toNodeRuntimeState = (
  projection: NodeOverlayProjection
): NodeRuntimeState => ({
  hovered: projection.hovered,
  hidden: projection.hidden,
  patched: Boolean(projection.patch),
  resizing: Boolean(projection.patch?.size)
})

const applyNodeTextPreview = (
  item: NodeItem,
  projection: NodeOverlayProjection
): NodeItem => {
  const text = projection.text
  if (!text || item.node.type !== 'text') {
    return item
  }

  const currentFontSize = typeof item.node.style?.fontSize === 'number'
    ? item.node.style.fontSize
    : undefined
  const style = text.fontSize === undefined || text.fontSize === currentFontSize
    ? item.node.style
    : {
        ...(item.node.style ?? {}),
        fontSize: text.fontSize
      }
  const data = text.mode === undefined || text.mode === readTextWidthMode(item.node)
    ? item.node.data
    : setTextWidthMode(item.node, text.mode)
  const rect = text.size
    && (
      text.size.width !== item.rect.width
      || text.size.height !== item.rect.height
    )
    ? {
        ...item.rect,
        width: text.size.width,
        height: text.size.height
      }
    : item.rect

  if (style === item.node.style && data === item.node.data && rect === item.rect) {
    return item
  }

  return {
    node: {
      ...item.node,
      style,
      data
    },
    rect
  }
}

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
    const projected = patch
      ? {
          node: applyNodeProjectionPatch(item.node, patch),
          rect: applyNodeProjectionRect(item.rect, patch)
        }
      : item

    return applyNodeTextPreview(projected, projection)
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
    enter: resolveNodeEnter(definition),
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
    geometry: (nodeId) => {
      const nextItem = item.get(nodeId)
      return nextItem
        ? readNodeItemGeometry(nextItem)
        : undefined
    },
    rect: (nodeId) => item.get(nodeId)?.rect,
    bounds: (nodeId) => {
      const nextItem = item.get(nodeId)
      return nextItem
        ? getNodeItemBounds(nextItem)
        : undefined
    },
    capability,
    idsInRect: read.node.idsInRect,
    transformTargets: read.node.transformTargets
  }
}
