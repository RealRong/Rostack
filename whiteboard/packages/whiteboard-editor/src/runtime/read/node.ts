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
  NodePatch
} from '../overlay/types'
import {
  type EditSession
} from '../state/edit'
import { readPresentValues } from './utils'

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
  geometry: NodeGeometry
}

export type NodeRead = {
  list: EngineRead['node']['list']
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

const readNodeRotation = (
  node: NodeItem['node']
) => (typeof node.rotation === 'number' ? node.rotation : 0)

const patchRect = (
  rect: Rect,
  patch?: {
    position?: {
      x: number
      y: number
    }
    size?: {
      width: number
      height: number
    }
  }
) => {
  if (!patch?.position && !patch?.size) {
    return rect
  }

  const next = {
    x: patch.position?.x ?? rect.x,
    y: patch.position?.y ?? rect.y,
    width: patch.size?.width ?? rect.width,
    height: patch.size?.height ?? rect.height
  }

  return sameRect(next, rect)
    ? rect
    : next
}

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

const applyNodePatch = (
  item: NodeItem,
  patch: NodePatch | undefined
): NodeItem => {
  if (!patch) {
    return item
  }

  const nextNode = (
    !patch.position
    && !patch.size
    && patch.rotation === undefined
  )
    ? item.node
    : {
        ...item.node,
        position: patch.position ?? item.node.position,
        size: patch.size ?? item.node.size,
        rotation:
          typeof patch.rotation === 'number'
            ? patch.rotation
            : item.node.rotation
      }
  const nextRect = patchRect(item.rect, patch)

  if (nextNode === item.node && nextRect === item.rect) {
    return item
  }

  return {
    node: nextNode,
    rect: nextRect
  }
}

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

const getNodeItemBounds = (
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
  const nextRect = patchRect(item.rect, text)

  if (
    style === item.node.style
    && dataWithWrapWidth === item.node.data
    && nextRect === item.rect
  ) {
    return item
  }

  return {
    node: {
      ...item.node,
      style,
      data: dataWithWrapWidth
    },
    rect: nextRect
  }
}

const applyNodeEditSession = (
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
      }
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

const applyNodeProjection = (
  item: NodeItem,
  projection: NodeOverlayProjection,
  edit: EditSession
): NodeItem => applyNodeEditSession(
  applyNodeTextPreview(
    applyNodePatch(item, projection.patch),
    projection
  ),
  edit
)

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

      return applyNodeProjection(
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
    item,
    nodes: (nodeIds) => readPresentValues(nodeIds, (nodeId) => item.get(nodeId)?.node),
    state,
    view,
    canvas,
    rect,
    bounds,
    capability,
    idsInRect: read.node.idsInRect,
    transformTargets: read.node.transformTargets,
    ordered: () => readPresentValues(read.node.list.get(), (nodeId) => item.get(nodeId)?.node)
  }
}
