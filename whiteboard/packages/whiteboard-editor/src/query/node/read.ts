import { node as nodeApi, type NodeRectHitOptions } from '@whiteboard/core/node'
import type {
  CommittedRead,
  NodeItem
} from '@whiteboard/editor/committed/read'
import { collection, equal, store } from '@shared/core'
import type {
  Node,
  NodeGeometry,
  NodeId,
  NodeModel,
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
  NodeGeometryPreview,
  NodePreviewProjection
} from '@whiteboard/editor/session/preview/types'
import type { NodeEditView } from '@whiteboard/editor/query/edit/read'
import type { DraftMeasure } from '@whiteboard/editor/layout/runtime'
import {
  debugMindmapEdit,
  debugRect,
  debugSize
} from '@whiteboard/editor/debug/mindmapEdit'

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
  hasControl: (node: NodeModel, control: ControlId) => boolean
  supportsStyle: (
    node: NodeModel,
    path: string,
    kind: NodeStyleFieldKind
  ) => boolean
}

export type NodeCapability = NodeTypeCapability

export type ProjectedOwnerGeometry = {
  rect: Rect
  rotation: number
}

export type ProjectedNode = {
  nodeId: NodeId
  node: NodeModel
  rect: Rect
  bounds: Rect
  rotation: number
}

export type ProjectedNodeGeometry = NodeGeometry & {
  rotation: number
}

export type NodeRenderEdit = {
  field: EditField
  caret: EditCaret
}

export type NodeRender = {
  nodeId: NodeId
  node: NodeModel
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

export type NodePresentationRead = {
  list: CommittedRead['node']['list']
  committed: CommittedRead['node']['committed']
  type: NodeTypeRead
  projected: store.KeyedReadStore<NodeId, ProjectedNode | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly NodeModel[]
  render: store.KeyedReadStore<NodeId, NodeRender | undefined>
  capability: (node: Pick<NodeModel, 'id' | 'type' | 'owner'>) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  ordered: () => readonly NodeModel[]
}

type NodeRuntime = {
  hovered: boolean
  hidden: boolean
  patched: boolean
  resizing: boolean
}

const EMPTY_CONTROLS: readonly ControlId[] = []
const nodeModelCache = new WeakMap<Node, NodeModel>()

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

const toNodeModel = (
  node: Node
): NodeModel => {
  const cached = nodeModelCache.get(node)
  if (cached) {
    return cached
  }

  const {
    position: _position,
    size: _size,
    rotation: _rotation,
    ...model
  } = node
  nodeModelCache.set(node, model)
  return model
}

export const toSpatialNode = ({
  node,
  rect,
  rotation
}: Pick<ProjectedNode, 'node' | 'rect' | 'rotation'>): Node => ({
  ...node,
  position: {
    x: rect.x,
    y: rect.y
  },
  size: {
    width: rect.width,
    height: rect.height
  },
  rotation
})

export const toProjectedNodeGeometry = (
  item: Pick<ProjectedNode, 'node' | 'rect' | 'rotation'>
): ProjectedNodeGeometry => {
  const spatial = toSpatialNode(item)
  const geometry = nodeApi.outline.geometry(
    spatial,
    item.rect,
    item.rotation
  )

  return {
    ...geometry,
    rotation: item.rotation
  }
}

const isProjectedNodeEqual = (
  left: ProjectedNode | undefined,
  right: ProjectedNode | undefined
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

const applyGeometryPreview = (
  rect: Rect,
  rotation: number,
  preview?: NodeGeometryPreview
) => ({
  rect: preview
    ? {
        x: preview.position?.x ?? rect.x,
        y: preview.position?.y ?? rect.y,
        width: preview.size?.width ?? rect.width,
        height: preview.size?.height ?? rect.height
      }
    : rect,
  rotation: preview?.rotation ?? rotation
})

const readNodeTextDraft = (
  committed: NodeItem,
  edit: NodeEditView | undefined,
  draft: DraftMeasure
) => {
  if (!edit) {
    return undefined
  }

  return {
    field: edit.field,
    value: edit.text,
    size:
      edit.field === 'text'
      && draft?.kind === 'size'
        ? draft.size
        : undefined,
    fontSize:
      edit.field === 'text'
      && committed.node.type === 'sticky'
      && draft?.kind === 'fit'
        ? draft.fontSize
        : undefined
  }
}

const resolveProjectedNodeCapability = (
  node: Pick<NodeModel, 'id' | 'type' | 'owner'>,
  type: NodeTypeRead
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

const readNodeRuntime = (
  feedback: NodePreviewProjection
): NodeRuntime => ({
  hovered: feedback.hovered,
  hidden: feedback.hidden,
  patched: Boolean(feedback.geometry || feedback.text),
  resizing: Boolean(
    feedback.geometry?.size
    || feedback.text?.handle
  )
})

const projectNode = ({
  committed,
  ownerGeometry,
  feedback,
  edit,
  draft
}: {
  committed: NodeItem
  ownerGeometry?: ProjectedOwnerGeometry
  feedback: NodePreviewProjection
  edit: NodeEditView | undefined
  draft: DraftMeasure
}): ProjectedNode => {
  const mindmapOwned = committed.node.owner?.kind === 'mindmap'
  const baseRotation = ownerGeometry?.rotation ?? nodeApi.geometry.rotation(committed.node)
  let rect = ownerGeometry?.rect ?? committed.rect

  if (!mindmapOwned && committed.node.type === 'text' && draft?.kind === 'size') {
    rect = {
      ...rect,
      width: draft.size.width,
      height: draft.size.height
    }
  }

  const geometry = !mindmapOwned
    ? applyGeometryPreview(rect, baseRotation, feedback.geometry)
    : {
        rect,
        rotation: baseRotation
      }

  const previewItem = nodeApi.projection.applyTextPreview({
    node: committed.node,
    rect: geometry.rect
  }, feedback.text)
  const contentItem = nodeApi.projection.applyTextDraft(
    previewItem,
    readNodeTextDraft(committed, edit, draft)
  )

  if (mindmapOwned && edit?.field === 'text') {
    debugMindmapEdit('node-read-project', {
      nodeId: committed.node.id,
      ownerGeometryRect: debugRect(ownerGeometry?.rect),
      committedRect: debugRect(committed.rect),
      draftKind: draft?.kind,
      draftSize: debugSize(draft?.kind === 'size' ? draft.size : undefined),
      geometryRect: debugRect(geometry.rect),
      contentRect: debugRect(contentItem.rect)
    })
  }

  const node = toNodeModel(contentItem.node)
  const projectedGeometry = toProjectedNodeGeometry({
    node,
    rect: contentItem.rect,
    rotation: geometry.rotation
  })

  return {
    nodeId: committed.node.id,
    node,
    rect: projectedGeometry.rect,
    bounds: projectedGeometry.bounds,
    rotation: projectedGeometry.rotation
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

const buildNodeRender = ({
  projected,
  feedback,
  selected,
  edit,
  type
}: {
  projected: ProjectedNode
  feedback: NodePreviewProjection
  selected: boolean
  edit: NodeEditView | undefined
  type: NodeTypeRead
}): NodeRender => {
  const runtime = readNodeRuntime(feedback)
  const capability = resolveProjectedNodeCapability(projected.node, type)

  return {
    nodeId: projected.nodeId,
    node: projected.node,
    rect: projected.rect,
    bounds: projected.bounds,
    rotation: projected.rotation,
    hovered: runtime.hovered,
    hidden: runtime.hidden,
    resizing: runtime.resizing,
    patched: runtime.patched,
    selected,
    edit: toNodeRenderEdit(edit),
    canConnect: capability.connect,
    canResize: capability.resize,
    canRotate: capability.rotate
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

export const createNodeRead = ({
  read,
  type,
  feedback,
  mindmap,
  edit,
  draft,
  selection
}: {
  read: CommittedRead
  type: NodeTypeRead
  feedback: store.KeyedReadStore<NodeId, NodePreviewProjection>
  mindmap: {
    nodeGeometry: store.KeyedReadStore<NodeId, ProjectedOwnerGeometry | undefined>
  }
  edit: {
    node: store.KeyedReadStore<NodeId, NodeEditView | undefined>
  }
  draft: {
    node: store.KeyedReadStore<NodeId, DraftMeasure>
  }
  selection: {
    selected: store.KeyedReadStore<NodeId, boolean>
  }
}): NodePresentationRead => {
  const projectedBase: NodePresentationRead['projected'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = store.read(read.node.committed, nodeId)
      if (!current) {
        return undefined
      }

      return projectNode({
        committed: current,
        ownerGeometry: store.read(mindmap.nodeGeometry, nodeId),
        feedback: store.read(feedback, nodeId),
        edit: store.read(edit.node, nodeId),
        draft: store.read(draft.node, nodeId)
      })
    },
    isEqual: isProjectedNodeEqual
  })

  const renderBase: NodePresentationRead['render'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const currentProjected = store.read(projectedBase, nodeId)
      if (!currentProjected) {
        return undefined
      }

      return buildNodeRender({
        projected: currentProjected,
        feedback: store.read(feedback, nodeId),
        selected: store.read(selection.selected, nodeId),
        edit: store.read(edit.node, nodeId),
        type
      })
    },
    isEqual: isNodeRenderEqual
  })

  const readProjectedNodes = (
    nodeIds: readonly NodeId[]
  ) => collection.presentValues(nodeIds, (nodeId) => store.read(projectedBase, nodeId)?.node)

  const idsInRect: NodePresentationRead['idsInRect'] = (rect, options) => {
    const match = options?.match ?? 'touch'
    const policy = options?.policy ?? 'default'
    const exclude = options?.exclude?.length
      ? new Set(options.exclude)
      : undefined
    const candidateIds = store.read(read.node.list).filter((nodeId) => !exclude?.has(nodeId))

    return nodeApi.hit.filterIdsInRect({
      rect,
      candidateIds,
      match,
      policy,
      getEntry: (nodeId) => {
        const current = store.read(projectedBase, nodeId)
        return current
          ? {
              node: toSpatialNode(current),
              rect: current.rect,
              rotation: current.rotation
            }
          : undefined
      },
      matchEntry: nodeApi.hit.matchRect
    })
  }

  return {
    list: read.node.list,
    committed: read.node.committed,
    type,
    projected: projectedBase,
    nodes: readProjectedNodes,
    render: renderBase,
    capability: (node) => resolveProjectedNodeCapability(node, type),
    idsInRect,
    ordered: () => readProjectedNodes(store.read(read.node.list))
  }
}
