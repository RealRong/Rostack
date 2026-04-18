import {
  type NodeRectHitOptions
} from '@whiteboard/core/node'
import type {
  EngineRead,
  NodeItem
} from '@whiteboard/engine'
import {
  createKeyedDerivedStore,
  presentValues,
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
  NodeRole,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  NodeDefinition,
  NodeRegistry
} from '@whiteboard/editor/types/node'
import type {
  MindmapPreviewState,
  NodePreviewProjection,
} from '@whiteboard/editor/session/preview/types'
import type { EditSession } from '@whiteboard/editor/local/session/edit'
import {
  projectNodeItem,
  readNodeProjectionRotation,
  readProjectedNodeBounds,
  readProjectedNodeGeometry
} from '@whiteboard/editor/query/node/projection'

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
  bounds: Rect
  rotation: number
  hovered: boolean
  hidden: boolean
  resizing: boolean
  patched: boolean
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
}

export type NodeRenderEdit = {
  field: Extract<NonNullable<EditSession>, { kind: 'node' }>['field']
  caret: Extract<NonNullable<EditSession>, { kind: 'node' }>['caret']
}

export type NodeRender = NodeView & {
  selected: boolean
  edit: NodeRenderEdit | undefined
}

export type NodeCanvasSnapshot = {
  node: Node
  geometry: ReturnType<typeof readProjectedNodeGeometry>
}

export type NodePresentationRead = {
  list: EngineRead['node']['list']
  committed: EngineRead['node']['item']
  item: KeyedReadStore<NodeId, NodeItem | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly Node[]
  state: KeyedReadStore<NodeId, NodeRuntimeState>
  view: KeyedReadStore<NodeId, NodeView | undefined>
  render: KeyedReadStore<NodeId, NodeRender | undefined>
  canvas: KeyedReadStore<NodeId, NodeCanvasSnapshot | undefined>
  rect: KeyedReadStore<NodeId, Rect | undefined>
  bounds: KeyedReadStore<NodeId, Rect | undefined>
  capability: (node: Pick<Node, 'type'> | NodeType) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  ordered: () => readonly Node[]
}

const readNodeType = (
  node: Pick<Node, 'type'> | NodeType
) => (
  typeof node === 'string'
    ? node
    : node.type
)

const isSelectableNode = (
  node: Pick<Node, 'type'> | undefined
) => node?.type !== 'mindmap'

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
    && sameRect(left.bounds, right.bounds)
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

const isNodeRenderEditEqual = (
  left: NodeRenderEdit | undefined,
  right: NodeRenderEdit | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.field === right.field
    && left.caret.kind === right.caret.kind
    && (
      left.caret.kind !== 'point'
      || (
        right.caret.kind === 'point'
        && left.caret.client.x === right.caret.client.x
        && left.caret.client.y === right.caret.client.y
      )
    )
  )
)

const isNodeRenderEqual = (
  left: NodeRender | undefined,
  right: NodeRender | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && isNodeViewEqual(left, right)
    && left.selected === right.selected
    && isNodeRenderEditEqual(left.edit, right.edit)
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
  node: Pick<Node, 'type' | 'mindmapId'>,
  definition?: NodeDefinition
): NodeCapability => {
  const role = definition?.role ?? 'content'
  const mindmapOwned = Boolean(node.mindmapId)
  const mindmapRoot = node.type === 'mindmap'

  return {
    role,
    connect: !mindmapRoot && (definition?.connect ?? true),
    enter: definition?.enter ?? false,
    resize: !mindmapOwned && !mindmapRoot && (definition?.canResize ?? true),
    rotate:
      !mindmapOwned
      && !mindmapRoot
      && (
        typeof definition?.canRotate === 'boolean'
          ? definition.canRotate
          : role === 'content'
      )
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
    bounds: getNodeItemBounds(item),
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

const isNodeSelected = (
  selection: SelectionTarget,
  nodeId: NodeId
) => selection.nodeIds.includes(nodeId)

const toNodeRenderEdit = (
  edit: EditSession,
  nodeId: NodeId
): NodeRenderEdit | undefined => (
  edit?.kind === 'node'
  && edit.nodeId === nodeId
    ? {
        field: edit.field,
        caret: edit.caret
      }
    : undefined
)

const getNodeItemBounds = (
  item: NodeItem
): Rect => readProjectedNodeBounds(item)

const readNodeItemGeometry = (
  item: NodeItem
): ReturnType<typeof readProjectedNodeGeometry> => readProjectedNodeGeometry(item)

const toNodeRuntimeState = (
  feedback: NodePreviewProjection
): NodeRuntimeState => ({
  hovered: feedback.hovered,
  hidden: feedback.hidden,
  patched: Boolean(feedback.patch || feedback.text),
  resizing: Boolean(
    feedback.patch?.size
    || feedback.text?.handle
    || feedback.text?.size
    || feedback.text?.position
  )
})

export const createNodeRead = ({
  read,
  registry,
  feedback,
  mindmap,
  edit,
  selection
}: {
  read: EngineRead
  registry: NodeRegistry
  feedback: KeyedReadStore<NodeId, NodePreviewProjection>
  mindmap: KeyedReadStore<NodeId, import('@whiteboard/engine').MindmapItem | undefined>
  edit: ReadStore<EditSession>
  selection: ReadStore<SelectionTarget>
}): NodePresentationRead => {
  const item: NodePresentationRead['item'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = readValue(read.node.item, nodeId)
      if (!current) {
        return undefined
      }

      const treeId = current.node.type === 'mindmap'
        ? current.node.id
        : current.node.mindmapId
      const mindmapItem = treeId
        ? readValue(mindmap, treeId)
        : undefined

      return projectNodeItem(
        current,
        readValue(feedback, nodeId),
        readValue(edit),
        mindmapItem
      )
    },
    isEqual: isNodeItemEqual
  })
  const state: NodePresentationRead['state'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => toNodeRuntimeState(
      readValue(feedback, nodeId)
    ),
    isEqual: isNodeStateEqual
  })
  const capability: NodePresentationRead['capability'] = (
    node: Pick<Node, 'type'> | NodeType
  ) => typeof node === 'string'
    ? resolveNodeCapability({ type: node }, registry.get(node))
    : resolveNodeCapability(node, registry.get(node.type))
  const view: NodePresentationRead['view'] = createKeyedDerivedStore({
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
  const render: NodePresentationRead['render'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const resolvedView = readValue(view, nodeId)
      if (!resolvedView) {
        return undefined
      }

      return {
        ...resolvedView,
        selected: isNodeSelected(readValue(selection), nodeId),
        edit: toNodeRenderEdit(readValue(edit), nodeId)
      }
    },
    isEqual: isNodeRenderEqual
  })
  const canvas: NodePresentationRead['canvas'] = createKeyedDerivedStore({
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
  const rect: NodePresentationRead['rect'] = createKeyedDerivedStore({
    get: (nodeId: NodeId) => readValue(item, nodeId)?.rect,
    isEqual: isSameOptionalRectTuple
  })
  const bounds: NodePresentationRead['bounds'] = createKeyedDerivedStore({
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
    nodes: (nodeIds) => presentValues(nodeIds, (nodeId) => {
      const node = readValue(item, nodeId)?.node
      return isSelectableNode(node)
        ? node
        : undefined
    }),
    state,
    view,
    render,
    canvas,
    rect,
    bounds,
    capability,
    idsInRect: (rect, options) => read.node.idsInRect(rect, options)
      .filter((nodeId) => isSelectableNode(read.node.item.get(nodeId)?.node)),
    ordered: () => presentValues(readValue(read.node.list), (nodeId) => {
      const node = readValue(item, nodeId)?.node
      return isSelectableNode(node)
        ? node
        : undefined
    })
  }
}
