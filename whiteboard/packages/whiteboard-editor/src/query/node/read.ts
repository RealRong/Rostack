import { node as nodeApi, type NodeRectHitOptions } from '@whiteboard/core/node'
import type {
  EngineRead,
  MindmapLayoutItem,
  NodeItem
} from '@whiteboard/engine'
import { collection, equal, store } from '@shared/core'
import type {
  NodeGeometry,
  Node,
  NodeId,
  NodeRole,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type {
  ControlId,
  NodeDefinition,
  NodeMeta,
  NodeRegistry
} from '@whiteboard/editor/types/node'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor/session/edit'
import type {
  NodePreviewProjection
} from '@whiteboard/editor/session/preview/types'
import type { NodeEditView } from '@whiteboard/editor/query/edit/read'

export type NodeStyleFieldKind = 'string' | 'number' | 'numberArray'

export type NodeTypeCapability = {
  role: NodeRole
  connect: boolean
  enter: boolean
  resize: boolean
  rotate: boolean
}

export type NodeTypeRead = {
  meta: (type: NodeType) => NodeMeta
  capability: (type: NodeType) => NodeTypeCapability
}

export type NodeTypeSupport = NodeTypeRead & {
  hasControl: (node: Node, control: ControlId) => boolean
  supportsStyle: (
    node: Node,
    path: string,
    kind: NodeStyleFieldKind
  ) => boolean
}

export type NodeCapability = NodeTypeCapability

export type NodeGeometryView = NodeGeometry & {
  rotation: number
}

export type NodeRenderEdit = {
  field: EditField
  caret: EditCaret
}

export type NodeRender = {
  nodeId: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
  hovered: boolean
  hidden: boolean
  resizing: boolean
  patched: boolean
  selected: boolean
  edit: NodeRenderEdit | undefined
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
}

export type NodeCanvasSnapshot = {
  node: Node
  geometry: NodeGeometryView
}

export type NodePresentationRead = {
  list: EngineRead['node']['list']
  committed: EngineRead['node']['item']
  type: NodeTypeRead
  geometry: store.KeyedReadStore<NodeId, NodeGeometryView | undefined>
  content: store.KeyedReadStore<NodeId, Node | undefined>
  item: store.KeyedReadStore<NodeId, NodeItem | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly Node[]
  render: store.KeyedReadStore<NodeId, NodeRender | undefined>
  canvas: store.KeyedReadStore<NodeId, NodeCanvasSnapshot | undefined>
  rect: store.KeyedReadStore<NodeId, Rect | undefined>
  bounds: store.KeyedReadStore<NodeId, Rect | undefined>
  capability: (node: Pick<Node, 'id' | 'type' | 'owner'>) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  ordered: () => readonly Node[]
}

type NodeRuntime = {
  hovered: boolean
  hidden: boolean
  patched: boolean
  resizing: boolean
}

const EMPTY_CONTROLS: readonly ControlId[] = []

const isSelectableNode = (
  node: Node | undefined
) => Boolean(node)

const readFallbackMeta = (
  type: NodeType
): NodeMeta => ({
  key: type,
  name: type,
  family: 'shape',
  icon: type,
  controls: EMPTY_CONTROLS
})

const readStyleValueMatchesKind = (
  value: unknown,
  kind: NodeStyleFieldKind
) => {
  if (kind === 'string') {
    return typeof value === 'string'
  }
  if (kind === 'number') {
    return typeof value === 'number'
  }

  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
}

const readDefinitionCapability = (
  definition: NodeDefinition | undefined
): NodeTypeCapability => {
  const role = definition?.role ?? 'content'

  return {
    role,
    connect: definition?.connect ?? true,
    enter: definition?.enter ?? false,
    resize: definition?.resize ?? true,
    rotate:
      typeof definition?.rotate === 'boolean'
        ? definition.rotate
        : role === 'content'
  }
}

export const createNodeTypeRead = (
  registry: NodeRegistry
): NodeTypeSupport => {
  const metaCache = new Map<NodeType, NodeMeta>()
  const capabilityCache = new Map<NodeType, NodeTypeCapability>()
  const styleSupportCache = new Map<string, boolean>()

  const readDefinition = (
    type: NodeType
  ) => registry.get(type)

  const meta: NodeTypeRead['meta'] = (type) => {
    const cached = metaCache.get(type)
    if (cached) {
      return cached
    }

    const next = readDefinition(type)?.meta ?? readFallbackMeta(type)
    metaCache.set(type, next)
    return next
  }

  const capability: NodeTypeRead['capability'] = (type) => {
    const cached = capabilityCache.get(type)
    if (cached) {
      return cached
    }

    const next = readDefinitionCapability(
      readDefinition(type)
    )
    capabilityCache.set(type, next)
    return next
  }

  return {
    meta,
    capability,
    hasControl: (node, control) => meta(node.type).controls.includes(control),
    supportsStyle: (node, path, kind) => {
      const cacheKey = `${node.type}\u0001${path}\u0001${kind}`
      const cached = styleSupportCache.get(cacheKey)
      if (cached !== undefined) {
        return cached || readStyleValueMatchesKind(node.style?.[path], kind)
      }

      const supported = readDefinition(node.type)?.schema?.fields.some((field) => (
        field.scope === 'style'
        && field.path === path
      )) ?? false

      styleSupportCache.set(cacheKey, supported)
      return supported || readStyleValueMatchesKind(node.style?.[path], kind)
    }
  }
}

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

const isNodeGeometryEqual = (
  left: NodeGeometryView | undefined,
  right: NodeGeometryView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.rotation === right.rotation
    && equal.sameRect(left.rect, right.rect)
    && equal.sameRect(left.bounds, right.bounds)
    && left.outline.kind === right.outline.kind
    && (
      left.outline.kind === 'rect' && right.outline.kind === 'rect'
        ? (
            equal.sameRect(left.outline.rect, right.outline.rect)
            && left.outline.rotation === right.outline.rotation
          )
        : left.outline.kind === 'polygon' && right.outline.kind === 'polygon'
          ? equal.samePointArray(left.outline.points, right.outline.points)
          : false
    )
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
    && left.nodeId === right.nodeId
    && left.node === right.node
    && equal.sameRect(left.rect, right.rect)
    && equal.sameRect(left.bounds, right.bounds)
    && left.rotation === right.rotation
    && left.hovered === right.hovered
    && left.hidden === right.hidden
    && left.resizing === right.resizing
    && left.patched === right.patched
    && left.selected === right.selected
    && left.canConnect === right.canConnect
    && left.canResize === right.canResize
    && left.canRotate === right.canRotate
    && isNodeRenderEditEqual(left.edit, right.edit)
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

const readNodeTextDraft = (
  item: NodeItem,
  edit: NodeEditView | undefined
) => {
  if (!edit) {
    return undefined
  }

  return {
    field: edit.field,
    value: edit.text,
    size: edit.field === 'text' && item.node.type === 'text'
      ? edit.size
      : undefined,
    fontSize: edit.field === 'text' && item.node.type === 'sticky'
      ? edit.fontSize
      : undefined
  }
}

const readTextGeometryPatch = (
  feedback: NodePreviewProjection
) => (
  feedback.text?.position || feedback.text?.size
    ? {
        position: feedback.text.position,
        size: feedback.text.size
      }
    : undefined
)

const applyMindmapGeometry = (
  item: NodeItem,
  mindmap: MindmapLayoutItem | undefined
) => {
  if (!mindmap) {
    return item
  }

  const rect = mindmap.computed.node[item.node.id]
  if (!rect) {
    return item
  }

  return nodeApi.projection.applyGeometryPatch(item, {
    position: {
      x: rect.x,
      y: rect.y
    },
    size: {
      width: rect.width,
      height: rect.height
    }
  })
}

const projectNodeGeometryItem = (
  item: NodeItem,
  feedback: NodePreviewProjection,
  mindmap: MindmapLayoutItem | undefined,
  edit: NodeEditView | undefined
): NodeItem => nodeApi.projection.applyGeometryPatch(
  applyMindmapGeometry(
    nodeApi.projection.applyGeometryPatch(
      nodeApi.projection.applyTextDraft(
        nodeApi.projection.applyTextPreview(item, feedback.text),
        readNodeTextDraft(item, edit)
      ),
      feedback.patch
    ),
    mindmap
  ),
  readTextGeometryPatch(feedback)
)

const projectNodeContent = (
  item: NodeItem,
  feedback: NodePreviewProjection,
  edit: NodeEditView | undefined
): Node => nodeApi.projection.applyTextDraft(
  nodeApi.projection.applyTextPreview(item, feedback.text),
  readNodeTextDraft(item, edit)
).node

const readNodeRuntime = (
  feedback: NodePreviewProjection
): NodeRuntime => ({
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

const readGeometryView = (
  item: NodeItem
): NodeGeometryView => {
  const rotation = nodeApi.geometry.rotation(item.node)
  const geometry = nodeApi.outline.geometry(
    item.node,
    item.rect,
    rotation
  )

  return {
    ...geometry,
    rotation
  }
}

const toNodeRenderEdit = (
  edit: NodeEditView | undefined
): NodeRenderEdit | undefined => (
  edit
    ? {
        field: edit.field,
        caret: edit.caret
      }
    : undefined
)

const resolveNodeCapability = (
  node: Pick<Node, 'id' | 'type' | 'owner'>,
  type: NodeTypeRead,
  _mindmap: store.KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
): NodeCapability => {
  const base = type.capability(node.type)
  const mindmapOwned = node.owner?.kind === 'mindmap'

  return {
    ...base,
    connect: base.connect,
    resize: !mindmapOwned && base.resize,
    rotate: !mindmapOwned && base.rotate
  }
}

export const createNodeRead = ({
  read,
  type,
  feedback,
  mindmap,
  edit,
  selection
}: {
  read: EngineRead
  type: NodeTypeRead
  feedback: store.KeyedReadStore<NodeId, NodePreviewProjection>
  mindmap: store.KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
  edit: {
    node: store.KeyedReadStore<NodeId, NodeEditView | undefined>
  }
  selection: {
    selected: store.KeyedReadStore<NodeId, boolean>
  }
}): NodePresentationRead => {
  const geometry: NodePresentationRead['geometry'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = store.read(read.node.item, nodeId)
      if (!current) {
        return undefined
      }

      const treeId = current.node.owner?.kind === 'mindmap'
        ? current.node.owner.id
        : undefined
      const geometryItem = projectNodeGeometryItem(
        current,
        store.read(feedback, nodeId),
        treeId
          ? store.read(mindmap, treeId)
          : undefined,
        store.read(edit.node, nodeId)
      )

      return readGeometryView(geometryItem)
    },
    isEqual: isNodeGeometryEqual
  })

  const content: NodePresentationRead['content'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = store.read(read.node.item, nodeId)
      return current
        ? projectNodeContent(
            current,
            store.read(feedback, nodeId),
            store.read(edit.node, nodeId)
          )
        : undefined
    },
    isEqual: (left, right) => left === right
  })

  const item: NodePresentationRead['item'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = store.read(read.node.item, nodeId)
      const currentGeometry = store.read(geometry, nodeId)
      const currentNode = store.read(content, nodeId)
      if (!current || !currentGeometry || !currentNode) {
        return undefined
      }

      return current.node === currentNode
        && equal.sameRect(current.rect, currentGeometry.rect)
        ? current
        : {
            node: currentNode,
            rect: currentGeometry.rect
          }
    },
    isEqual: isNodeItemEqual
  })

  const rect: NodePresentationRead['rect'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => store.read(geometry, nodeId)?.rect,
    isEqual: equal.sameOptionalRect
  })

  const bounds: NodePresentationRead['bounds'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => store.read(geometry, nodeId)?.bounds,
    isEqual: equal.sameOptionalRect
  })

  const render: NodePresentationRead['render'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const currentNode = store.read(content, nodeId)
      const currentGeometry = store.read(geometry, nodeId)
      if (!currentNode || !currentGeometry) {
        return undefined
      }

      const runtime = readNodeRuntime(
        store.read(feedback, nodeId)
      )
      const currentCapability = resolveNodeCapability(currentNode, type, mindmap)

      return {
        nodeId,
        node: currentNode,
        rect: currentGeometry.rect,
        bounds: currentGeometry.bounds,
        rotation: currentGeometry.rotation,
        hovered: runtime.hovered,
        hidden: runtime.hidden,
        resizing: runtime.resizing,
        patched: runtime.patched,
        selected: store.read(selection.selected, nodeId),
        edit: toNodeRenderEdit(store.read(edit.node, nodeId)),
        canConnect: currentCapability.connect,
        canResize: currentCapability.resize,
        canRotate: currentCapability.rotate
      }
    },
    isEqual: isNodeRenderEqual
  })

  const canvas: NodePresentationRead['canvas'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const currentNode = store.read(content, nodeId)
      const currentGeometry = store.read(geometry, nodeId)
      if (!currentNode || !currentGeometry) {
        return undefined
      }

      return {
        node: currentNode,
        geometry: currentGeometry
      }
    },
    isEqual: isNodeCanvasSnapshotEqual
  })

  return {
    list: read.node.list,
    committed: read.node.item,
    type,
    geometry,
    content,
    item,
    nodes: (nodeIds) => collection.presentValues(nodeIds, (nodeId) => {
      const node = store.read(content, nodeId)
      return isSelectableNode(node)
        ? node
        : undefined
    }),
    render,
    canvas,
    rect,
    bounds,
    capability: (node) => resolveNodeCapability(node, type, mindmap),
    idsInRect: (rect, options) => read.node.idsInRect(rect, options)
      .filter((nodeId) => isSelectableNode(read.node.item.get(nodeId)?.node)),
    ordered: () => collection.presentValues(store.read(read.node.list), (nodeId) => {
      const node = store.read(content, nodeId)
      return isSelectableNode(node)
        ? node
        : undefined
    })
  }
}
