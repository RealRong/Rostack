import {
  readTextWrapWidth,
  getNodeBounds,
  getNodeGeometry,
  readTextWidthMode,
  setTextWrapWidth,
  setTextWidthMode,
  type NodeRectHitOptions,
  type TransformSelectionTargets
} from '@whiteboard/core/node'
import type {
  EngineRead,
  NodeItem
} from '@whiteboard/engine'
import {
  createKeyedDerivedStore,
  type KeyedReadStore,
  type ReadStore
} from '@shared/store'
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
  applyNodeProjectionPatch,
  applyNodeProjectionRect
} from './nodeProjection'
import {
  resolveNodeConnect,
  resolveNodeEnter,
  resolveNodeRole,
  resolveNodeTransform,
  type NodeRole
} from './nodeCapability'
import {
  createOverlayStateStore,
  createPatchedItemStore
} from './keyed'
import {
  applyNodeEditStyle,
  type EditSession
} from '../state/edit'

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

export type NodeRead = {
  list: EngineRead['node']['list']
  item: KeyedReadStore<NodeId, NodeItem | undefined>
  state: KeyedReadStore<NodeId, NodeRuntimeState>
  view: KeyedReadStore<NodeId, NodeView | undefined>
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

const isRectEqual = (
  left: Rect,
  right: Rect
) => (
  left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
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
    && isRectEqual(left.rect, right.rect)
    && isRectEqual(left.frameRect, right.frameRect)
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

const readNodeRotation = (
  node: NodeItem['node']
) => (typeof node.rotation === 'number' ? node.rotation : 0)

const toNodeView = (
  nodeId: NodeId,
  item: NodeItem,
  state: NodeRuntimeState,
  capability: NodeCapability
): NodeView => {
  const rotation = readNodeRotation(item.node)

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
  patched: Boolean(projection.patch || projection.text),
  resizing: Boolean(
    projection.patch?.size
    || projection.text?.handle
    || projection.text?.size
    || projection.text?.position
  )
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
  const nextWrapWidth = text.mode === 'auto'
    ? undefined
    : text.wrapWidth
  const dataWithWrapWidth = nextWrapWidth === readTextWrapWidth(item.node)
    ? data
    : setTextWrapWidth({ data }, nextWrapWidth)
  const rect = text.size
    || text.position
    ? {
        x: text.position?.x ?? item.rect.x,
        y: text.position?.y ?? item.rect.y,
        width: text.size?.width ?? item.rect.width,
        height: text.size?.height ?? item.rect.height
      }
    : item.rect

  if (style === item.node.style && dataWithWrapWidth === item.node.data && rect === item.rect) {
    return item
  }

  return {
    node: {
      ...item.node,
      style,
      data: dataWithWrapWidth
    },
    rect
  }
}

const applyEditSession = (
  item: NodeItem,
  edit: EditSession
): NodeItem => {
  if (!edit || edit.kind !== 'node' || edit.nodeId !== item.node.id) {
    return item
  }

  return {
    node: {
      ...item.node,
      data: {
        ...(item.node.data ?? {}),
        [edit.field]: edit.draft.text
      },
      style: applyNodeEditStyle(item.node.style, edit.draft.style)
    },
    rect:
      edit.field === 'text'
      && item.node.type === 'text'
      && edit.layout.liveSize
        ? {
            ...item.rect,
            width: edit.layout.liveSize.width,
            height: edit.layout.liveSize.height
          }
        : item.rect
  }
}

const createNodeItemStore = ({
  read,
  overlay,
  edit
}: {
  read: Pick<EngineRead, 'node'>
  overlay: KeyedReadStore<NodeId, NodeOverlayProjection>
  edit: ReadStore<EditSession>
}): NodeRead['item'] => createPatchedItemStore({
  source: read.node.item,
  overlay,
  project: (item, projection, readStore) => {
    const patch = projection.patch
    const projected = patch
      ? {
          node: applyNodeProjectionPatch(item.node, patch),
          rect: applyNodeProjectionRect(item.rect, patch)
        }
      : item

    return applyEditSession(
      applyNodeTextPreview(projected, projection),
      readStore(edit)
    )
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

const createNodeViewStore = ({
  item,
  state,
  capability
}: {
  item: NodeRead['item']
  state: NodeRead['state']
  capability: NodeRead['capability']
}): NodeRead['view'] => createKeyedDerivedStore({
  get: (readStore, nodeId: NodeId) => {
    const resolvedItem = readStore(item, nodeId)
    if (!resolvedItem) {
      return undefined
    }

    const resolvedState = readStore(state, nodeId)
    return toNodeView(
      nodeId,
      resolvedItem,
      resolvedState,
      capability(resolvedItem.node)
    )
  },
  isEqual: isNodeViewEqual
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
  overlay,
  edit
}: {
  read: EngineRead
  registry: NodeRegistry
  overlay: KeyedReadStore<NodeId, NodeOverlayProjection>
  edit: ReadStore<EditSession>
}): NodeRead => {
  const item = createNodeItemStore({
    read,
    overlay,
    edit
  })
  const state = createNodeStateStore({
    overlay
  })
  const capability = createNodeCapabilityResolver(registry)
  const view = createNodeViewStore({
    item,
    state,
    capability
  })

  return {
    list: read.node.list,
    item,
    state,
    view,
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
