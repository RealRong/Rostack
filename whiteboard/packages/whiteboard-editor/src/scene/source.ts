import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Rect,
} from '@whiteboard/core/types'
import type {
  GroupView,
  Read as EditorGraphQuery
} from '@whiteboard/editor-scene'
import type {
  EditorDocumentRuntimeSource
} from '@whiteboard/editor/document/source'
import type { ScenePublishedState } from '@whiteboard/editor/projection/sources'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import {
  createGraphEdgeRead,
  type GraphEdgeRead
} from './edge'
import { readMindmapNavigateTarget } from './mindmap'
import {
  createGraphNodeRead,
  toGraphNodeGeometry,
  type GraphNodeRead
} from './node'
import {
  createGraphSelectionRead,
  type GraphSelectionRead
} from './selection'

export type EditorSceneRuntime = {
  revision: () => number
  snapshot: ScenePublishedState['snapshot']
  items: ScenePublishedState['items']
  query: {
    rect: EditorGraphQuery['spatial']['rect']
    visible: (
      options?: Parameters<EditorGraphQuery['spatial']['rect']>[1]
    ) => ReturnType<EditorGraphQuery['spatial']['rect']>
  }
  spatial: EditorGraphQuery['spatial']
  snap: {
    rect: EditorGraphQuery['snap']
  }
  geometry: {
    node: (nodeId: NodeId) => ReturnType<typeof toGraphNodeGeometry> & {
      node: NonNullable<ReturnType<GraphNodeRead['graph']['get']>>['base']['node']
    } | undefined
    edge: GraphEdgeRead['geometry']['get']
    order: (item: {
      kind: 'node' | 'edge' | 'mindmap'
      id: string
    }) => number
  }
  scope: {
    move: (target: SelectionTarget) => {
      nodes: ReturnType<GraphNodeRead['nodes']>
      edges: ReturnType<GraphEdgeRead['edges']>
    }
    relatedEdges: (nodeIds: readonly NodeId[]) => readonly EdgeId[]
    bounds: (target: SelectionTarget) => Rect | undefined
  }
  frame: EditorGraphQuery['frame']
  node: GraphNodeRead
  edge: GraphEdgeRead
  nodes: {
    get: (nodeId: NodeId) => ReturnType<GraphNodeRead['view']['get']>
    getMany: (nodeIds: readonly NodeId[]) => readonly NonNullable<ReturnType<GraphNodeRead['view']['get']>>[]
    ids: GraphNodeRead['ids']
    read: GraphNodeRead['view']
    capability: store.KeyedReadStore<NodeId, ReturnType<GraphNodeRead['capability']> | undefined>
  }
  edges: {
    get: (edgeId: EdgeId) => ReturnType<GraphEdgeRead['view']['get']>
    getMany: (edgeIds: readonly EdgeId[]) => readonly NonNullable<ReturnType<GraphEdgeRead['view']['get']>>[]
    ids: GraphEdgeRead['ids']
    read: GraphEdgeRead['view']
    geometry: GraphEdgeRead['geometry']
  }
  selection: GraphSelectionRead
  mindmap: {
    view: ScenePublishedState['mindmap']
    id: (value: string) => MindmapId | undefined
    structure: (
      value: MindmapId | string
    ) => ReturnType<EditorGraphQuery['mindmapStructure']>
    navigate: (input: {
      id: MindmapId
      fromNodeId: NodeId
      direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
    }) => NodeId | undefined
  }
  group: {
    view: ScenePublishedState['group']
    ofNode: (nodeId: string) => GroupId | undefined
    ofEdge: (edgeId: string) => GroupId | undefined
    target: (groupId: GroupId) => SelectionTarget | undefined
    exact: (target: SelectionTarget) => readonly GroupId[]
  }
  chrome: ScenePublishedState['chrome']
}

const toGroupTarget = (
  items: GroupView['structure']['items']
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: items.flatMap((item) => (
    item.kind === 'node'
      ? [item.id]
      : []
  )),
  edgeIds: items.flatMap((item) => (
    item.kind === 'edge'
      ? [item.id]
      : []
  ))
})

const collectPresentValues = <TId extends string, TValue>(
  ids: readonly TId[],
  readValue: (id: TId) => TValue | undefined
): readonly TValue[] => ids.flatMap((id) => {
  const value = readValue(id)
  return value ? [value] : []
})

export const createSceneSource = ({
  document,
  sources,
  query,
  spatial,
  selection,
  nodeType,
  visibleRect
}: {
  document: Pick<EditorDocumentRuntimeSource, 'node' | 'edge'>
  sources: Pick<ScenePublishedState, 'snapshot' | 'items' | 'chrome' | 'nodeGraphIds' | 'nodeGraph' | 'edgeGraphIds' | 'edgeGraph' | 'mindmap' | 'group' | 'nodeUi' | 'edgeUi'>
  query: Pick<EditorGraphQuery, 'mindmapId' | 'mindmapStructure' | 'relatedEdges' | 'groupExact' | 'snap' | 'frame'>
  spatial: EditorGraphQuery['spatial']
  selection: store.ReadStore<SelectionTarget>
  nodeType: NodeTypeSupport
  visibleRect: () => Rect
}): EditorSceneRuntime => {
  const node = createGraphNodeRead({
    document,
    sources,
    spatial,
    type: nodeType
  })
  const edge = createGraphEdgeRead({
    document,
    sources,
    spatial,
    relatedEdges: query.relatedEdges,
    node
  })
  const selectionSource = createGraphSelectionRead({
    source: selection,
    node,
    edge
  })
  const visibleQueryCache = {
    revision: -1,
    rect: undefined as Rect | undefined,
    kinds: '' as string,
    result: [] as ReturnType<EditorGraphQuery['spatial']['rect']>
  }
  const orderIndex = store.createDerivedStore<Map<string, number>>({
    get: () => new Map(
      store.read(sources.items).map((item, index) => [`${item.kind}:${item.id}`, index] as const)
    ),
    isEqual: (left, right) => left === right
  })
  const nodeCapability = store.createKeyedDerivedStore<NodeId, ReturnType<GraphNodeRead['capability']> | undefined>({
    get: (nodeId) => {
      const current = store.read(node.graph, nodeId)
      return current
        ? node.capability(current.base.node)
        : undefined
    }
  })

  const queryApi: EditorSceneRuntime['query'] = {
    rect: spatial.rect,
    visible: (options: Parameters<EditorGraphQuery['spatial']['rect']>[1]) => {
      const rect = visibleRect()
      const snapshot = store.read(sources.snapshot)
      const kinds = options?.kinds?.join('|') ?? '*'

      if (
        visibleQueryCache.revision === snapshot.revision
        && visibleQueryCache.kinds === kinds
        && visibleQueryCache.rect?.x === rect.x
        && visibleQueryCache.rect?.y === rect.y
        && visibleQueryCache.rect?.width === rect.width
        && visibleQueryCache.rect?.height === rect.height
      ) {
        return visibleQueryCache.result
      }

      const result = spatial.rect(rect, options)
      visibleQueryCache.revision = snapshot.revision
      visibleQueryCache.rect = rect
      visibleQueryCache.kinds = kinds
      visibleQueryCache.result = result
      return result
    }
  }

  return {
    revision: () => store.read(sources.snapshot).revision,
    snapshot: sources.snapshot,
    items: sources.items,
    query: queryApi,
    spatial,
    snap: {
      rect: query.snap
    },
    geometry: {
      node: (nodeId) => {
        const current = store.read(node.graph, nodeId)
        return current
          ? {
              ...toGraphNodeGeometry({
                node: current.base.node,
                rect: current.geometry.rect,
                rotation: current.geometry.rotation
              }),
              node: current.base.node
            }
          : undefined
      },
      edge: (edgeId) => store.read(edge.geometry, edgeId),
      order: (item) => store.read(orderIndex).get(`${item.kind}:${item.id}`) ?? -1
    },
    scope: {
      move: (target) => {
        const relatedEdgeIds = new Set([
          ...target.edgeIds,
          ...query.relatedEdges(target.nodeIds)
        ])

        return {
          nodes: node.nodes(target.nodeIds),
          edges: edge.edges([...relatedEdgeIds])
        }
      },
      relatedEdges: (nodeIds) => query.relatedEdges(nodeIds),
      bounds: (target) => {
        const nodeBounds = target.nodeIds.flatMap((nodeId) => {
          const current = store.read(node.graph, nodeId)
          return current ? [current.geometry.bounds] : []
        })
        const edgeBounds = target.edgeIds.flatMap((edgeId) => {
          const current = store.read(edge.bounds, edgeId)
          return current ? [current] : []
        })

        return geometryApi.rect.boundingRect([
          ...nodeBounds,
          ...edgeBounds
        ])
      }
    },
    frame: query.frame,
    node,
    edge,
    nodes: {
      get: (nodeId) => store.read(node.view, nodeId),
      getMany: (nodeIds) => collectPresentValues(nodeIds, (nodeId) => store.read(node.view, nodeId)),
      ids: node.ids,
      read: node.view,
      capability: nodeCapability
    },
    edges: {
      get: (edgeId) => store.read(edge.view, edgeId),
      getMany: (edgeIds) => collectPresentValues(edgeIds, (edgeId) => store.read(edge.view, edgeId)),
      ids: edge.ids,
      read: edge.view,
      geometry: edge.geometry
    },
    selection: selectionSource,
    mindmap: {
      view: sources.mindmap,
      id: (value) => {
        store.read(sources.snapshot)
        return query.mindmapId(value)
      },
      structure: (value) => {
        store.read(sources.snapshot)
        return query.mindmapStructure(value as MindmapId | string)
      },
      navigate: (input) => {
        const structure = query.mindmapStructure(input.id)
        return structure
          ? readMindmapNavigateTarget({
              structure,
              fromNodeId: input.fromNodeId,
              direction: input.direction
            })
          : undefined
      }
    },
    group: {
      view: sources.group,
      ofNode: (nodeId) => store.read(sources.nodeGraph, nodeId)?.base.node.groupId,
      ofEdge: (edgeId) => store.read(sources.edgeGraph, edgeId)?.base.edge.groupId,
      target: (groupId) => {
        const group = store.read(sources.group, groupId)
        return group
          ? toGroupTarget(group.structure.items)
          : undefined
      },
      exact: query.groupExact
    },
    chrome: sources.chrome
  }
}
