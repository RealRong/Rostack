import { node as nodeApi, type NodeRectHitOptions } from '@whiteboard/core/node'
import { collection, store } from '@shared/core'
import type {
  Read as EditorGraphQuery,
  NodeUiView as RuntimeNodeUiView,
  NodeView as RuntimeNodeView
} from '@whiteboard/editor-scene'
import type {
  Node,
  NodeGeometry,
  NodeId,
  NodeModel,
  Rect
} from '@whiteboard/core/types'
import type {
  NodeTypeCapability,
  NodeTypeSupport
} from '@whiteboard/editor/types/node'

export type NodeCapability = NodeTypeCapability

export type GraphNodeGeometry = NodeGeometry & {
  rotation: number
}

export type EditorNodeView = {
  nodeId: NodeId
  node: NodeModel
  rect: Rect
  bounds: Rect
  rotation: number
  hidden: boolean
  selected: boolean
  hovered: boolean
  patched: boolean
  resizing: boolean
  edit?: RuntimeNodeUiView['edit']
}

export type GraphNodeRead = {
  projected: store.KeyedReadStore<NodeId, RuntimeNodeView | undefined>
  ui: store.KeyedReadStore<NodeId, RuntimeNodeUiView | undefined>
  get: (nodeId: NodeId) => EditorNodeView | undefined
  view: store.KeyedReadStore<NodeId, EditorNodeView | undefined>
  geometry: (nodeId: NodeId) => (GraphNodeGeometry & {
    node: NodeModel
  }) | undefined
  ids: () => readonly NodeId[]
  all: () => readonly EditorNodeView[]
  nodes: (nodeIds: readonly NodeId[]) => readonly NodeModel[]
  capability: (node: Pick<NodeModel, 'id' | 'type' | 'owner'>) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
}

type EditorNodeViewSources = {
  graph: RuntimeNodeView | undefined
  ui: RuntimeNodeUiView | undefined
}

const isEditorNodeViewEqual = (
  left: EditorNodeView | undefined,
  right: EditorNodeView | undefined
) => left === right || (
  left !== undefined
  && right !== undefined
  && left.nodeId === right.nodeId
  && left.node === right.node
  && left.rotation === right.rotation
  && left.rect.x === right.rect.x
  && left.rect.y === right.rect.y
  && left.rect.width === right.rect.width
  && left.rect.height === right.rect.height
  && left.bounds.x === right.bounds.x
  && left.bounds.y === right.bounds.y
  && left.bounds.width === right.bounds.width
  && left.bounds.height === right.bounds.height
  && left.hidden === right.hidden
  && left.selected === right.selected
  && left.hovered === right.hovered
  && left.patched === right.patched
  && left.resizing === right.resizing
  && left.edit?.field === right.edit?.field
  && left.edit?.caret.kind === right.edit?.caret.kind
  && (
    left.edit?.caret.kind !== 'point'
    || (
      right.edit?.caret.kind === 'point'
      && left.edit.caret.client.x === right.edit.caret.client.x
      && left.edit.caret.client.y === right.edit.caret.client.y
    )
  )
)

const toEditorNodeView = (
  graph: RuntimeNodeView | undefined,
  ui: RuntimeNodeUiView | undefined
): EditorNodeView | undefined => {
  if (!graph) {
    return undefined
  }

  return {
    nodeId: graph.base.node.id,
    node: graph.base.node,
    rect: graph.geometry.rect,
    bounds: graph.geometry.bounds,
    rotation: graph.geometry.rotation,
    hidden: ui?.hidden ?? false,
    selected: ui?.selected ?? false,
    hovered: ui?.hovered ?? false,
    patched: ui?.patched ?? false,
    resizing: ui?.resizing ?? false,
    edit: ui?.edit
  }
}

export const toSpatialNode = ({
  node,
  rect,
  rotation
}: {
  node: NodeModel
  rect: Rect
  rotation: number
}): Node => ({
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

export const toGraphNodeGeometry = (
  item: {
    node: NodeModel
    rect: Rect
    rotation: number
  }
): GraphNodeGeometry => {
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

export const resolveNodeCapability = (
  node: Pick<NodeModel, 'id' | 'type' | 'owner'>,
  type: Pick<NodeTypeSupport, 'capability'>
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

export const createGraphNodeRead = ({
  sources,
  spatial,
  type,
  geometry
}: {
  sources: {
    nodeGraphIds: store.ReadStore<readonly NodeId[]>
    nodeGraph: store.KeyedReadStore<NodeId, RuntimeNodeView | undefined>
    nodeUi: store.KeyedReadStore<NodeId, RuntimeNodeUiView | undefined>
  }
  spatial: EditorGraphQuery['spatial']
  type: Pick<NodeTypeSupport, 'capability'>
  geometry: (nodeId: NodeId) => (GraphNodeGeometry & {
    node: NodeModel
  }) | undefined
}): GraphNodeRead => {
  const readIds = () => store.read(sources.nodeGraphIds) as readonly NodeId[]

  const readProjectedNodes = (
    nodeIds: readonly NodeId[]
  ) => collection.presentValues(nodeIds, (nodeId) => store.read(sources.nodeGraph, nodeId)?.base.node)

  const readAll = () => collection.presentValues(
    readIds(),
    (nodeId) => store.read(view, nodeId)
  )

  const viewSources = store.createStructKeyedStore<NodeId, EditorNodeViewSources>({
    fields: {
      graph: {
        get: (nodeId) => store.read(sources.nodeGraph, nodeId)
      },
      ui: {
        get: (nodeId) => store.read(sources.nodeUi, nodeId)
      }
    }
  })

  const view: GraphNodeRead['view'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = store.read(viewSources, nodeId)
      return toEditorNodeView(current.graph, current.ui)
    },
    isEqual: isEditorNodeViewEqual
  })

  const idsInRect: GraphNodeRead['idsInRect'] = (rect, options) => {
    const match = options?.match ?? 'touch'
    const policy = options?.policy ?? 'default'
    const exclude = options?.exclude?.length
      ? new Set(options.exclude)
      : undefined
    const candidateIds = spatial.rect(rect, {
      kinds: ['node']
    })
      .map((record) => record.item.id)
      .filter((nodeId) => !exclude?.has(nodeId))

    return nodeApi.hit.filterIdsInRect({
      rect,
      candidateIds,
      match,
      policy,
      getEntry: (nodeId) => {
        const current = store.read(sources.nodeGraph, nodeId)
        return current
          ? {
              node: toSpatialNode({
                node: current.base.node,
                rect: current.geometry.rect,
                rotation: current.geometry.rotation
              }),
              rect: current.geometry.rect,
              rotation: current.geometry.rotation
            }
          : undefined
      },
      matchEntry: nodeApi.hit.matchRect
    })
  }

  return {
    projected: sources.nodeGraph,
    ui: sources.nodeUi,
    get: (nodeId) => store.read(view, nodeId),
    view,
    geometry,
    ids: readIds,
    all: readAll,
    nodes: readProjectedNodes,
    capability: (node) => resolveNodeCapability(node, type),
    idsInRect
  }
}
