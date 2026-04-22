import { node as nodeApi, type NodeRectHitOptions } from '@whiteboard/core/node'
import { collection, equal, store } from '@shared/core'
import type {
  Node,
  NodeGeometry,
  NodeId,
  NodeModel,
  Rect
} from '@whiteboard/core/types'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type { EditorPublishedSources } from '@whiteboard/editor/publish/sources'
import type {
  NodeTypeCapability,
  NodeTypeSupport
} from '@whiteboard/editor/types/node'

export type NodeCapability = NodeTypeCapability

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

export type ProjectionNodeRead = {
  list: DocumentRead['node']['list']
  committed: DocumentRead['node']['committed']
  projected: store.KeyedReadStore<NodeId, ProjectedNode | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly NodeModel[]
  capability: (node: Pick<NodeModel, 'id' | 'type' | 'owner'>) => NodeCapability
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  ordered: () => readonly NodeModel[]
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

export const resolveProjectedNodeCapability = (
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

export const createProjectionNodeRead = ({
  document,
  published,
  type
}: {
  document: Pick<DocumentRead, 'node'>
  published: Pick<EditorPublishedSources, 'node'>
  type: Pick<NodeTypeSupport, 'capability'>
}): ProjectionNodeRead => {
  const projected: ProjectionNodeRead['projected'] = store.createKeyedDerivedStore({
    get: (nodeId: NodeId) => {
      const current = store.read(published.node, nodeId)
      if (!current) {
        return undefined
      }

      return {
        nodeId: current.base.node.id,
        node: current.base.node,
        rect: current.layout.rect,
        bounds: current.layout.bounds,
        rotation: current.layout.rotation
      }
    },
    isEqual: isProjectedNodeEqual
  })

  const readProjectedNodes = (
    nodeIds: readonly NodeId[]
  ) => collection.presentValues(nodeIds, (nodeId) => store.read(projected, nodeId)?.node)

  const idsInRect: ProjectionNodeRead['idsInRect'] = (rect, options) => {
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
        const current = store.read(projected, nodeId)
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
    list: document.node.list,
    committed: document.node.committed,
    projected,
    nodes: readProjectedNodes,
    capability: (node) => resolveProjectedNodeCapability(node, type),
    idsInRect,
    ordered: () => readProjectedNodes(store.read(document.node.list))
  }
}
