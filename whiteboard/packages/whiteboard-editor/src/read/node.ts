import { node as nodeApi, type NodeRectHitOptions } from '@whiteboard/core/node'
import { collection, store } from '@shared/core'
import type { NodeView } from '@whiteboard/editor-graph'
import type {
  Node,
  NodeGeometry,
  NodeId,
  NodeModel,
  Rect
} from '@whiteboard/core/types'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type { ProjectionSources } from '@whiteboard/editor/projection/sources'
import type {
  NodeTypeCapability,
  NodeTypeSupport
} from '@whiteboard/editor/types/node'

export type NodeCapability = NodeTypeCapability

export type GraphNodeGeometry = NodeGeometry & {
  rotation: number
}

export type GraphNodeRead = {
  list: DocumentRead['node']['list']
  committed: DocumentRead['node']['committed']
  view: store.KeyedReadStore<NodeId, NodeView | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly NodeModel[]
  capability: (node: Pick<NodeModel, 'id' | 'type' | 'owner'>) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  ordered: () => readonly NodeModel[]
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
  document,
  sources,
  type
}: {
  document: Pick<DocumentRead, 'node'>
  sources: Pick<ProjectionSources, 'node'>
  type: Pick<NodeTypeSupport, 'capability'>
}): GraphNodeRead => {
  const readProjectedNodes = (
    nodeIds: readonly NodeId[]
  ) => collection.presentValues(nodeIds, (nodeId) => store.read(sources.node, nodeId)?.base.node)

  const idsInRect: GraphNodeRead['idsInRect'] = (rect, options) => {
    const match = options?.match ?? 'touch'
    const policy = options?.policy ?? 'default'
    const exclude = options?.exclude?.length
      ? new Set(options.exclude)
      : undefined
    const candidateIds = store.read(document.node.list).filter((nodeId) => !exclude?.has(nodeId))

    return nodeApi.hit.filterIdsInRect({
      rect,
      candidateIds,
      match,
      policy,
      getEntry: (nodeId) => {
        const current = store.read(sources.node, nodeId)
        return current
          ? {
              node: toSpatialNode({
                node: current.base.node,
                rect: current.layout.rect,
                rotation: current.layout.rotation
              }),
              rect: current.layout.rect,
              rotation: current.layout.rotation
            }
          : undefined
      },
      matchEntry: nodeApi.hit.matchRect
    })
  }

  return {
    list: document.node.list,
    committed: document.node.committed,
    view: sources.node,
    nodes: readProjectedNodes,
    capability: (node) => resolveNodeCapability(node, type),
    idsInRect,
    ordered: () => readProjectedNodes(store.read(document.node.list))
  }
}
